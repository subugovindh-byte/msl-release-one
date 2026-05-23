import { useState } from 'react';
import { PageHeader } from '@/components/Shared';
import {
  useBankAccounts, useCreateBankAccount,
  useBankStatement, useImportBankStatement,
  useReconcileLine, useBRS,
  usePayments,
} from '@/hooks/useApi';
import { formatINR } from '@/utils/format';
import { useToastStore } from '@/store';

const EMPTY_ACCOUNT = { name: '', bank_name: '', account_no: '', ifsc: '', branch: '', opening_balance_paise: 0, opening_date: '' };

type View = 'statement' | 'brs';

export function BankReconPage() {
  const { notify } = useToastStore();
  const { data: accData } = useBankAccounts();
  const accounts: any[] = (accData as any)?.accounts || [];

  const [selectedBankId, setSelectedBankId] = useState('');
  const [view, setView] = useState<View>('statement');
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [stmtFilter, setStmtFilter] = useState<{ reconciled?: string; from?: string; to?: string }>({});
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [accForm, setAccForm] = useState(EMPTY_ACCOUNT);
  const [csvText, setCsvText] = useState('');
  const [matchingLineId, setMatchingLineId] = useState<number | null>(null);
  const [matchPaymentId, setMatchPaymentId] = useState('');

  const { data: stmtData, isLoading: stmtLoading } = useBankStatement(selectedBankId, stmtFilter);
  const { data: brsData } = useBRS(selectedBankId, asOf);
  const { data: paymentsData } = usePayments({ from: stmtFilter.from });
  const payments: any[] = (paymentsData as any)?.payments || [];

  const createAccount = useCreateBankAccount();
  const importStmt = useImportBankStatement(selectedBankId);
  const reconcile = useReconcileLine();

  const lines: any[] = (stmtData as any)?.lines || [];
  const bank: any = (stmtData as any)?.bank || null;

  function handleCreateAccount() {
    if (!accForm.name || !accForm.bank_name) { notify('Name and bank name required', 'error'); return; }
    createAccount.mutate({
      ...accForm,
      opening_balance_paise: Math.round(Number(accForm.opening_balance_paise) * 100),
    }, {
      onSuccess: () => { notify('Bank account created', 'success'); setShowNewAccount(false); setAccForm(EMPTY_ACCOUNT); },
      onError: (e: any) => notify(e.message, 'error'),
    });
  }

  function handleImportCSV() {
    // Parse simple CSV: date,description,ref_no,debit,credit,balance
    const importedLines: any[] = [];
    const rows = csvText.trim().split('\n');
    for (const row of rows) {
      const cols = row.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      if (cols.length < 5) continue;
      const [txn_date, description, ref_no, debit, credit, balance] = cols;
      if (!txn_date || txn_date === 'Date') continue;
      importedLines.push({
        txn_date,
        description: description || null,
        ref_no: ref_no || null,
        debit_paise: Math.round(parseFloat(debit || '0') * 100),
        credit_paise: Math.round(parseFloat(credit || '0') * 100),
        running_balance_paise: Math.round(parseFloat(balance || '0') * 100),
      });
    }
    if (!importedLines.length) { notify('No valid rows found. Expected: Date,Description,Ref,Debit,Credit,Balance', 'error'); return; }
    importStmt.mutate({ lines: importedLines }, {
      onSuccess: (d: any) => { notify(`Imported ${d.imported}, auto-matched ${d.auto_matched}`, 'success'); setShowImport(false); setCsvText(''); },
      onError: (e: any) => notify(e.message, 'error'),
    });
  }

  function handleManualReconcile(lineId: number) {
    if (!matchPaymentId) { notify('Select a payment', 'error'); return; }
    reconcile.mutate({ lineId, payment_id: matchPaymentId }, {
      onSuccess: () => { notify('Line reconciled', 'success'); setMatchingLineId(null); setMatchPaymentId(''); },
      onError: (e: any) => notify(e.message, 'error'),
    });
  }

  const brs: any = brsData as any;
  const unreconciledCredit = (stmtData as any)?.unreconciled_credit || 0;
  const unreconciledDebit = (stmtData as any)?.unreconciled_debit || 0;

  return (
    <div className="page">
      <PageHeader
        title="Bank Reconciliation"
        subtitle="Reconcile bank statement lines with recorded payments"
        action={
          <button className="btn-primary" onClick={() => setShowNewAccount(true)}>+ Bank Account</button>
        }
      />

      {/* Account selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label className="fl">Bank Account</label>
          <select className="fi" value={selectedBankId} onChange={e => setSelectedBankId(e.target.value)} style={{ minWidth: 240 }}>
            <option value="">— Select Account —</option>
            {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.bank_name})</option>)}
          </select>
        </div>
        {selectedBankId && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setView('statement')}
                style={{ padding: '8px 16px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: view === 'statement' ? 'var(--rust)' : 'var(--bg1)', color: view === 'statement' ? 'white' : 'var(--t2)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >Statement</button>
              <button
                onClick={() => setView('brs')}
                style={{ padding: '8px 16px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: view === 'brs' ? 'var(--rust)' : 'var(--bg1)', color: view === 'brs' ? 'white' : 'var(--t2)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >BRS</button>
            </div>
            <button className="btn-secondary" onClick={() => setShowImport(true)}>Import CSV</button>
          </>
        )}
      </div>

      {/* Statement view */}
      {selectedBankId && view === 'statement' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div><label className="fl">From</label><input type="date" className="fi" value={stmtFilter.from || ''} onChange={e => setStmtFilter(f => ({ ...f, from: e.target.value || undefined }))} /></div>
            <div><label className="fl">To</label><input type="date" className="fi" value={stmtFilter.to || ''} onChange={e => setStmtFilter(f => ({ ...f, to: e.target.value || undefined }))} /></div>
            <div>
              <label className="fl">Status</label>
              <select className="fi" value={stmtFilter.reconciled ?? ''} onChange={e => setStmtFilter(f => ({ ...f, reconciled: e.target.value || undefined }))}>
                <option value="">All</option>
                <option value="false">Unreconciled</option>
                <option value="true">Reconciled</option>
              </select>
            </div>
          </div>

          {/* Summary chips */}
          {bank && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 600 }}>Unreconciled Credits</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#2e7d32' }}>{formatINR(unreconciledCredit)}</div>
              </div>
              <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 600 }}>Unreconciled Debits</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--rust)' }}>{formatINR(unreconciledDebit)}</div>
              </div>
            </div>
          )}

          {stmtLoading && <p style={{ color: 'var(--t3)' }}>Loading…</p>}
          {!stmtLoading && lines.length === 0 && (
            <p style={{ color: 'var(--t3)' }}>No statement lines found. Import a CSV to get started.</p>
          )}

          {lines.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg3)' }}>
                    {['Date', 'Description', 'Ref', 'Debit', 'Credit', 'Balance', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: ['Debit','Credit','Balance'].includes(h) ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l: any) => (
                    <>
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--bd)', backgroundColor: l.reconciled ? 'rgba(46,125,50,0.04)' : 'transparent' }}>
                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{l.txn_date}</td>
                        <td style={{ padding: '7px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description || '—'}</td>
                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--t3)' }}>{l.ref_no || '—'}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--rust)' }}>{l.debit_paise > 0 ? formatINR(l.debit_paise) : '—'}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#2e7d32' }}>{l.credit_paise > 0 ? formatINR(l.credit_paise) : '—'}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{formatINR(l.running_balance_paise)}</td>
                        <td style={{ padding: '7px 10px' }}>
                          {l.reconciled
                            ? <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 10, backgroundColor: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }}>Reconciled</span>
                            : <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 10, backgroundColor: 'var(--amberW)', color: '#e65100', fontWeight: 600 }}>Pending</span>
                          }
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          {!l.reconciled && (
                            <button
                              onClick={() => setMatchingLineId(matchingLineId === l.id ? null : l.id)}
                              style={{ padding: '3px 10px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'var(--bg1)', cursor: 'pointer', fontSize: 11 }}
                            >Match</button>
                          )}
                          {l.reconciled && l.matched_payment_id && (
                            <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'monospace' }}>{l.matched_payment_id}</span>
                          )}
                        </td>
                      </tr>
                      {matchingLineId === l.id && (
                        <tr key={`match-${l.id}`} style={{ backgroundColor: 'var(--bg2)' }}>
                          <td colSpan={8} style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>Match to payment:</span>
                              <select className="fi" value={matchPaymentId} onChange={e => setMatchPaymentId(e.target.value)} style={{ minWidth: 260 }}>
                                <option value="">— Select payment —</option>
                                {payments
                                  .filter((p: any) => !p.bank_recon_matched)
                                  .map((p: any) => (
                                    <option key={p.id} value={p.id}>{p.id} · {p.date} · {formatINR(p.amount_paise)}</option>
                                  ))}
                              </select>
                              <button
                                onClick={() => handleManualReconcile(l.id)}
                                disabled={reconcile.isPending}
                                style={{ padding: '6px 14px', border: 'none', borderRadius: 4, backgroundColor: 'var(--rust)', color: 'white', cursor: 'pointer', fontSize: 12 }}
                              >Confirm Match</button>
                              <button
                                onClick={() => setMatchingLineId(null)}
                                style={{ padding: '6px 10px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12 }}
                              >Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* BRS view */}
      {selectedBankId && view === 'brs' && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end' }}>
            <div><label className="fl">As of Date</label><input type="date" className="fi" value={asOf} onChange={e => setAsOf(e.target.value)} /></div>
          </div>
          {brs && (
            <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 20 }}>
              <h3 style={{ marginTop: 0, marginBottom: 20 }}>Bank Reconciliation Statement — {brs.as_of}</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--bd)', fontSize: 13 }}>
                <span>Balance as per Bank Statement</span>
                <span style={{ fontWeight: 700 }}>{formatINR(brs.bank_balance_paise)}</span>
              </div>
              {brs.uncleared_deposits?.length > 0 && (
                <>
                  <div style={{ padding: '8px 0 4px', color: 'var(--t3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Add: Uncleared Deposits in Transit</div>
                  {brs.uncleared_deposits.map((d: any) => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 14px', fontSize: 12 }}>
                      <span style={{ color: 'var(--t2)' }}>{d.date} · {d.customer_name || d.id}</span>
                      <span style={{ color: '#2e7d32' }}>{formatINR(d.amount_paise)}</span>
                    </div>
                  ))}
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 8px', borderTop: '2px solid var(--bd)', marginTop: 12, fontSize: 15, fontWeight: 700 }}>
                <span>Adjusted Balance (Book Balance)</span>
                <span style={{ color: 'var(--rust)' }}>{formatINR(brs.adjusted_balance_paise)}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>
                {brs.total_uncleared_deposits_paise > 0
                  ? `${brs.uncleared_deposits.length} uncleared deposit(s) totalling ${formatINR(brs.total_uncleared_deposits_paise)}`
                  : 'No uncleared deposits — books agree with bank statement'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── New Bank Account modal ── */}
      {showNewAccount && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNewAccount(false)}>
          <div style={{ backgroundColor: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 28, width: 420, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 20 }}>Register Bank Account</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}><label className="fl">Account Nickname *</label><input className="fi" value={accForm.name} onChange={e => setAccForm(f => ({ ...f, name: e.target.value }))} placeholder="SBI Current A/C" /></div>
              <div><label className="fl">Bank Name *</label><input className="fi" value={accForm.bank_name} onChange={e => setAccForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="State Bank of India" /></div>
              <div><label className="fl">Branch</label><input className="fi" value={accForm.branch} onChange={e => setAccForm(f => ({ ...f, branch: e.target.value }))} /></div>
              <div><label className="fl">Account No.</label><input className="fi" value={accForm.account_no} onChange={e => setAccForm(f => ({ ...f, account_no: e.target.value }))} /></div>
              <div><label className="fl">IFSC</label><input className="fi" value={accForm.ifsc} onChange={e => setAccForm(f => ({ ...f, ifsc: e.target.value }))} /></div>
              <div><label className="fl">Opening Balance (₹)</label><input type="number" className="fi" value={accForm.opening_balance_paise || ''} onChange={e => setAccForm(f => ({ ...f, opening_balance_paise: Number(e.target.value) }))} /></div>
              <div><label className="fl">Opening Date</label><input type="date" className="fi" value={accForm.opening_date} onChange={e => setAccForm(f => ({ ...f, opening_date: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowNewAccount(false)} style={{ padding: '8px 18px', border: '1px solid var(--bd)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreateAccount} disabled={createAccount.isPending} style={{ padding: '8px 18px', border: 'none', borderRadius: 4, backgroundColor: 'var(--rust)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import CSV modal ── */}
      {showImport && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowImport(false)}>
          <div style={{ backgroundColor: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 28, width: 560, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Import Bank Statement CSV</h3>
            <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 0 }}>
              Paste CSV rows (no header) in format:<br />
              <code>Date, Description, Ref No, Debit, Credit, Running Balance</code>
            </p>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              rows={10}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, padding: 10, border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'var(--bg2)', color: 'var(--t1)', resize: 'vertical', boxSizing: 'border-box' }}
              placeholder={'2025-05-01,"NEFT CREDIT SBI REF123","REF123","","100000.00","542000.00"\n2025-05-02,"CHEQUE PAYMENT","CHQ456","50000.00","","492000.00"'}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowImport(false)} style={{ padding: '8px 18px', border: '1px solid var(--bd)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleImportCSV} disabled={importStmt.isPending || !csvText.trim()} style={{ padding: '8px 18px', border: 'none', borderRadius: 4, backgroundColor: 'var(--rust)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                {importStmt.isPending ? 'Importing…' : 'Import & Auto-Match'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
