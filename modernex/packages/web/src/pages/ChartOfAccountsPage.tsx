import { useState } from 'react';
import {
  useAccountGroups, useAccounts, useCreateAccount,
  useJournalVouchers, useCreateJournalVoucher, useTrialBalance, useBalanceSheet,
} from '@/hooks/useApi';
import { formatINR, numericInputValue, selectOnFocus } from '@/utils/format';
import { useToastStore } from '@/store';

type Tab = 'accounts' | 'vouchers' | 'trial-balance' | 'balance-sheet';

const NATURE_COLORS: Record<string, string> = {
  asset: 'var(--blue)', liability: 'var(--red)', capital: 'var(--rust)', income: 'var(--sage)', expense: 'var(--amber)',
};

type JVEntry = { account_id: string; debit_paise: number; credit_paise: number; narration: string };

export function ChartOfAccountsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('accounts');
  const [showCreateAcc, setShowCreateAcc] = useState(false);
  const [showCreateJV, setShowCreateJV] = useState(false);
  const [accForm, setAccForm] = useState({ name: '', group_id: '', code: '', opening_balance_paise: 0, is_debit_balance: true });
  const [jvForm, setJvForm] = useState({ date: new Date().toISOString().slice(0, 10), narration: '', voucher_type: 'journal', entries: [{ account_id: '', debit_paise: 0, credit_paise: 0, narration: '' }, { account_id: '', debit_paise: 0, credit_paise: 0, narration: '' }] as JVEntry[] });
  const { notify } = useToastStore();

  const { data: groupsData } = useAccountGroups();
  const { data: accountsData } = useAccounts({});
  const { data: vouchersData } = useJournalVouchers({});
  const { data: tbData } = useTrialBalance();
  const { data: bsData } = useBalanceSheet();
  const createAccount = useCreateAccount();
  const createJV = useCreateJournalVoucher();

  const groups: any[] = groupsData?.groups || [];
  const accounts: any[] = accountsData?.accounts || [];
  const vouchers: any[] = vouchersData?.vouchers || [];
  const tbRows: any[] = (tbData as any)?.rows || [];
  const bsRaw = bsData as any;

  const totalDebit  = (tbData as any)?.totals?.totalDebit || 0;
  const totalCredit = (tbData as any)?.totals?.totalCredit || 0;

  const jvTotalDr = jvForm.entries.reduce((s, e) => s + (e.debit_paise || 0), 0);
  const jvTotalCr = jvForm.entries.reduce((s, e) => s + (e.credit_paise || 0), 0);
  const jvBalanced = jvTotalDr === jvTotalCr && jvTotalDr > 0;

  const addEntry = () => setJvForm({ ...jvForm, entries: [...jvForm.entries, { account_id: '', debit_paise: 0, credit_paise: 0, narration: '' }] });
  const removeEntry = (i: number) => setJvForm({ ...jvForm, entries: jvForm.entries.filter((_, idx) => idx !== i) });
  const updateEntry = (i: number, field: string, value: any) => {
    const entries = jvForm.entries.map((e, idx) => idx === i ? { ...e, [field]: value } : e);
    setJvForm({ ...jvForm, entries });
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAccount.mutateAsync({ ...accForm, opening_balance_paise: Math.round(accForm.opening_balance_paise * 100) });
      notify('Account created', 'success');
      setShowCreateAcc(false);
      setAccForm({ name: '', group_id: '', code: '', opening_balance_paise: 0, is_debit_balance: true });
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleCreateJV = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jvBalanced) { notify('Voucher is not balanced (Dr ≠ Cr)', 'error'); return; }
    try {
      await createJV.mutateAsync({
        ...jvForm,
        entries: jvForm.entries.map((e) => ({
          ...e,
          debit_paise: Math.round(e.debit_paise * 100),
          credit_paise: Math.round(e.credit_paise * 100),
        })),
      });
      notify('Journal voucher posted', 'success');
      setShowCreateJV(false);
      setJvForm({ date: new Date().toISOString().slice(0, 10), narration: '', voucher_type: 'journal', entries: [{ account_id: '', debit_paise: 0, credit_paise: 0, narration: '' }, { account_id: '', debit_paise: 0, credit_paise: 0, narration: '' }] });
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const TAB_LABELS: Record<Tab, string> = {
    accounts: `Accounts (${accounts.length})`,
    vouchers: `Journal Vouchers (${vouchers.length})`,
    'trial-balance': 'Trial Balance',
    'balance-sheet': 'Balance Sheet',
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>Chart of Accounts</h1>
        <p style={{ color: 'var(--t3)', fontSize: 13, margin: 0 }}>Double-entry bookkeeping · Journal vouchers · Trial Balance · Balance Sheet</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--bd)', flexWrap: 'wrap' }}>
        {(['accounts', 'vouchers', 'trial-balance', 'balance-sheet'] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '11px 22px', border: 'none', marginBottom: -2,
            borderBottom: activeTab === tab ? '3px solid var(--rust)' : '3px solid transparent',
            backgroundColor: 'transparent', color: activeTab === tab ? 'var(--t1)' : 'var(--t3)',
            fontWeight: activeTab === tab ? 700 : 500, cursor: 'pointer', fontSize: 14,
          }}>{TAB_LABELS[tab]}</button>
        ))}
        <div style={{ marginLeft: 'auto', paddingBottom: 4 }}>
          {activeTab === 'accounts' && (
            <button onClick={() => setShowCreateAcc(!showCreateAcc)} style={{ padding: '8px 18px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              {showCreateAcc ? 'Cancel' : '+ New Account'}
            </button>
          )}
          {activeTab === 'vouchers' && (
            <button onClick={() => setShowCreateJV(!showCreateJV)} style={{ padding: '8px 18px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              {showCreateJV ? 'Cancel' : '+ Post Journal Entry'}
            </button>
          )}
        </div>
      </div>

      {/* Create Account */}
      {showCreateAcc && activeTab === 'accounts' && (
        <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Create Ledger Account</h3>
          <form onSubmit={handleCreateAccount}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div><label className="fl">Account Name *</label><input type="text" value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} required className="fi" /></div>
              <div>
                <label className="fl">Account Group *</label>
                <select value={accForm.group_id} onChange={(e) => setAccForm({ ...accForm, group_id: e.target.value })} required className="fsel">
                  <option value="">— Select group —</option>
                  {groups.filter((g) => !g.parent_id).map((g: any) => (
                    <optgroup key={g.id} label={g.name.toUpperCase()}>
                      {groups.filter((sg: any) => sg.parent_id === g.id).map((sg: any) => (
                        <option key={sg.id} value={sg.id}>{sg.name}</option>
                      ))}
                      <option value={g.id}>{g.name} (top level)</option>
                    </optgroup>
                  ))}
                </select>
              </div>
              <div><label className="fl">Account Code</label><input type="text" value={accForm.code} onChange={(e) => setAccForm({ ...accForm, code: e.target.value })} className="fi" placeholder="e.g. 1050" /></div>
              <div>
                <label className="fl">Opening Balance (₹)</label>
                <input type="number" step="0.01" value={numericInputValue(accForm.opening_balance_paise)} onChange={(e) => setAccForm({ ...accForm, opening_balance_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} className="fi" />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" id="is-debit" checked={accForm.is_debit_balance} onChange={(e) => setAccForm({ ...accForm, is_debit_balance: e.target.checked })} />
                <label htmlFor="is-debit" className="fl" style={{ margin: 0, cursor: 'pointer' }}>Opening balance is Debit</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={createAccount.isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Create Account</button>
              <button type="button" onClick={() => setShowCreateAcc(false)} style={{ padding: '10px 20px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Journal Voucher Form */}
      {showCreateJV && activeTab === 'vouchers' && (
        <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Post Journal Entry</h3>
          <form onSubmit={handleCreateJV}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div><label className="fl">Date *</label><input type="date" value={jvForm.date} onChange={(e) => setJvForm({ ...jvForm, date: e.target.value })} required className="fi" /></div>
              <div>
                <label className="fl">Voucher Type</label>
                <select value={jvForm.voucher_type} onChange={(e) => setJvForm({ ...jvForm, voucher_type: e.target.value })} className="fsel">
                  {['journal','contra','payment','receipt','sales','purchase','debit_note','credit_note'].map((t) => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}><label className="fl">Narration *</label><input type="text" value={jvForm.narration} onChange={(e) => setJvForm({ ...jvForm, narration: e.target.value })} required className="fi" placeholder="Brief description of the transaction" /></div>
            </div>
            {/* Entries */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr auto', gap: 8, marginBottom: 6, fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, padding: '0 4px' }}>
                <span>Account</span><span>Debit (₹)</span><span>Credit (₹)</span><span>Narration</span><span></span>
              </div>
              {jvForm.entries.map((entry, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr auto', gap: 8, marginBottom: 8 }}>
                  <select value={entry.account_id} onChange={(e) => updateEntry(i, 'account_id', e.target.value)} required className="fsel">
                    <option value="">— Account —</option>
                    {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
                  </select>
                  <input type="number" step="0.01" value={numericInputValue(entry.debit_paise)} onChange={(e) => updateEntry(i, 'debit_paise', parseFloat(e.target.value) || 0)} onFocus={selectOnFocus} className="fi" placeholder="0.00" />
                  <input type="number" step="0.01" value={numericInputValue(entry.credit_paise)} onChange={(e) => updateEntry(i, 'credit_paise', parseFloat(e.target.value) || 0)} onFocus={selectOnFocus} className="fi" placeholder="0.00" />
                  <input type="text" value={entry.narration} onChange={(e) => updateEntry(i, 'narration', e.target.value)} className="fi" placeholder="Line narration" />
                  {jvForm.entries.length > 2 && (
                    <button type="button" title="Remove entry" onClick={() => removeEntry(i)} style={{ padding: '0 10px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', color: 'var(--rust)', cursor: 'pointer' }}>✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addEntry} style={{ fontSize: 12, padding: '5px 14px', border: '1px dashed var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--t2)' }}>+ Add Line</button>
            </div>
            {/* Balance indicator */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 14, padding: '10px 16px', backgroundColor: 'var(--bg3)', borderRadius: 8, fontSize: 13 }}>
              <span>Dr Total: <strong>{formatINR(Math.round(jvTotalDr * 100))}</strong></span>
              <span>Cr Total: <strong>{formatINR(Math.round(jvTotalCr * 100))}</strong></span>
              <span style={{ marginLeft: 'auto', fontWeight: 700, color: jvBalanced ? 'var(--sage)' : 'var(--rust)' }}>
                {jvBalanced ? '✓ Balanced' : `Difference: ${formatINR(Math.round(Math.abs(jvTotalDr - jvTotalCr) * 100))}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={!jvBalanced || createJV.isPending} style={{ padding: '10px 24px', backgroundColor: jvBalanced ? 'var(--rust)' : 'var(--bg3)', color: jvBalanced ? 'white' : 'var(--t3)', border: 'none', borderRadius: 4, cursor: jvBalanced ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
                {createJV.isPending ? 'Posting...' : 'Post Voucher'}
              </button>
              <button type="button" onClick={() => setShowCreateJV(false)} style={{ padding: '10px 20px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Accounts Tab */}
      {activeTab === 'accounts' && (
        <div>
          {groups.filter((g) => !g.parent_id).map((group: any) => {
            const subgroups = groups.filter((sg: any) => sg.parent_id === group.id);
            const allGroupIds = [group.id, ...subgroups.map((sg: any) => sg.id)];
            const groupAccounts = accounts.filter((a: any) => allGroupIds.includes(a.group_id));
            if (!groupAccounts.length) return null;
            return (
              <div key={group.id} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: NATURE_COLORS[group.nature] }}>{group.name}</span>
                  <div style={{ flex: 1, height: 1, backgroundColor: 'var(--bd)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {groupAccounts.map((a: any) => (
                    <div key={a.id} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                      {a.code && <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--t3)', minWidth: 50 }}>{a.code}</span>}
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--t3)' }}>{a.group_name}</span>
                      {a.opening_balance_paise > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--t2)' }}>Op. Bal: {formatINR(a.opening_balance_paise)}</span>
                      )}
                      {a.is_system ? <span style={{ fontSize: 10, color: 'var(--t3)', padding: '1px 6px', border: '1px solid var(--bd)', borderRadius: 10 }}>System</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vouchers Tab */}
      {activeTab === 'vouchers' && (
        vouchers.length === 0 ? <p style={{ color: 'var(--t3)' }}>No journal vouchers posted yet.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
              {['Voucher ID', 'Date', 'Type', 'Narration', 'Created By'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--t2)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {vouchers.map((v: any) => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--t3)' }}>{v.id}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{v.date}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, backgroundColor: 'var(--bg3)', color: 'var(--t2)', textTransform: 'capitalize' }}>{v.voucher_type.replace('_', ' ')}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>{v.narration}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t3)', fontSize: 12 }}>{v.created_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {/* Trial Balance */}
      {activeTab === 'trial-balance' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--t2)' }}>From journal entries + opening balances</span>
            {Math.abs(totalDebit - totalCredit) < 2 && totalDebit > 0 && (
              <span style={{ color: 'var(--sage)', fontWeight: 700, fontSize: 13 }}>✓ Trial Balance tallies</span>
            )}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
              {['Code', 'Account', 'Group', 'Opening', 'Period Dr', 'Period Cr', 'Closing Balance'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: h.includes('Dr') || h.includes('Cr') || h.includes('Balance') || h.includes('Opening') ? 'right' : 'left', fontWeight: 700, color: 'var(--t2)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {tbRows.map((r: any) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                  <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 11, color: 'var(--t3)' }}>{r.code || '—'}</td>
                  <td style={{ padding: '9px 14px', fontWeight: 600 }}>{r.account_name}</td>
                  <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--t3)' }}>{r.group_name}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12 }}>{r.opening_balance_paise ? formatINR(r.opening_balance_paise) : '—'}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', color: r.period_debit > 0 ? 'var(--rust)' : 'var(--t3)' }}>{r.period_debit > 0 ? formatINR(r.period_debit) : '—'}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', color: r.period_credit > 0 ? 'var(--sage)' : 'var(--t3)' }}>{r.period_credit > 0 ? formatINR(r.period_credit) : '—'}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>
                    {formatINR(Math.abs(r.closing_balance))} <span style={{ fontSize: 10, color: 'var(--t3)' }}>{r.closing_is_debit ? 'Dr' : 'Cr'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: 'var(--bg3)', fontWeight: 700 }}>
                <td colSpan={4} style={{ padding: '10px 14px' }}>Total</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--rust)' }}>{formatINR(totalDebit)}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--sage)' }}>{formatINR(totalCredit)}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Balance Sheet */}
      {activeTab === 'balance-sheet' && bsRaw && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          {/* Left: Liabilities + Capital */}
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: 'var(--red)' }}>Liabilities & Capital</h3>
            {['capital', 'liability'].map((nature) => (
              <div key={nature} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: NATURE_COLORS[nature], marginBottom: 8, letterSpacing: '0.5px' }}>{nature === 'capital' ? 'Capital' : 'Liabilities'}</div>
                {(nature === 'capital' ? bsRaw.capital : bsRaw.liabilities)?.map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid var(--bd)', fontSize: 13 }}>
                    <span>{r.account_name}</span>
                    <span>{formatINR(Math.abs(r.closing_balance))}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: 'var(--bg3)', fontWeight: 700, borderRadius: 6 }}>
              <span>Net Profit</span>
              <span style={{ color: bsRaw.totals?.net_profit_paise >= 0 ? 'var(--sage)' : 'var(--rust)' }}>{formatINR(Math.abs(bsRaw.totals?.net_profit_paise || 0))}</span>
            </div>
          </div>

          {/* Right: Assets */}
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: 'var(--blue)' }}>Assets</h3>
            {bsRaw.assets?.map((r: any) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid var(--bd)', fontSize: 13 }}>
                <span>{r.account_name}</span>
                <span>{formatINR(Math.abs(r.closing_balance))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
