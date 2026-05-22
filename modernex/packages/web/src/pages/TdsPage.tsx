import { useState } from 'react';
import {
  useTdsSections, useTdsTransactions, useCreateTds, useDepositTds,
  useTdsChallans, useCreateTdsChallan, useTds26Q, useVendors,
} from '@/hooks/useApi';
import { formatINR, numericInputValue, selectOnFocus } from '@/utils/format';
import { useToastStore } from '@/store';

type Tab = 'transactions' | 'challans' | '26q';

const CUR_FY = (() => {
  const m = new Date().getMonth() + 1;
  const y = new Date().getFullYear();
  const s = m >= 4 ? y : y - 1;
  return `${String(s).slice(-2)}-${String(s + 1).slice(-2)}`;
})();

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const BLANK_TDS = { vendor_id: '', section: '194C', payment_date: new Date().toISOString().slice(0, 10), gross_amount_paise: 0, tds_rate_pct: 1.0, notes: '' };
const BLANK_CHALLAN = { challan_date: new Date().toISOString().slice(0, 10), bsr_code: '', challan_serial_no: '', section: '194C', amount_paise: 0, fy: CUR_FY, quarter: 'Q1' };

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  blue:   { bg: 'var(--blueW)',  color: 'var(--blue)'  },
  purple: { bg: 'var(--goldW)',  color: 'var(--gold)'  },
  green:  { bg: 'var(--sageW)', color: 'var(--sage)'  },
  amber:  { bg: 'var(--amberW)', color: 'var(--amber)' },
  red:    { bg: 'var(--redW)',  color: 'var(--red)'   },
};

const DEFAULT_BADGE_STYLE = { bg: 'var(--blueW)', color: 'var(--blue)' };

function Badge({ label, variant }: { label: string; variant: keyof typeof BADGE_STYLES }) {
  const s = BADGE_STYLES[variant] ?? DEFAULT_BADGE_STYLE;
  return <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, backgroundColor: s.bg, color: s.color }}>{label}</span>;
}

export function TdsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('transactions');
  const [showCreate, setShowCreate] = useState(false);
  const [showChallan, setShowChallan] = useState(false);
  const [form, setForm] = useState({ ...BLANK_TDS });
  const [challanForm, setChallanForm] = useState({ ...BLANK_CHALLAN });
  const [depositingId, setDepositingId] = useState<string | null>(null);
  const [depositForm, setDepositForm] = useState({ challan_no: '', challan_date: '', bsr_code: '' });
  const [fy, setFy] = useState(CUR_FY);
  const [quarter, setQuarter] = useState('Q1');
  const { notify } = useToastStore();

  const { data: sectionsData } = useTdsSections();
  const { data: txnData } = useTdsTransactions({ fy });
  const { data: challanData } = useTdsChallans({ fy });
  const { data: q26Data } = useTds26Q(activeTab === '26q' ? fy : undefined, activeTab === '26q' ? quarter : undefined);
  const { data: vendorsData } = useVendors({});
  const createTds = useCreateTds();
  const depositTds = useDepositTds(depositingId || '');
  const createChallan = useCreateTdsChallan();

  const sections = sectionsData?.sections || [];
  const transactions = txnData?.transactions || [];
  const challans = challanData?.challans || [];
  const vendors = (vendorsData as any)?.vendors || [];


  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const grossPaise = Math.round(form.gross_amount_paise * 100);
      await createTds.mutateAsync({ ...form, gross_amount_paise: grossPaise, tds_rate_pct: Number(form.tds_rate_pct) });
      notify('TDS transaction recorded', 'success');
      setShowCreate(false);
      setForm({ ...BLANK_TDS });
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await depositTds.mutateAsync(depositForm);
      notify('Marked as deposited', 'success');
      setDepositingId(null);
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createChallan.mutateAsync({ ...challanForm, amount_paise: Math.round(challanForm.amount_paise * 100) });
      notify('Challan recorded', 'success');
      setShowChallan(false);
      setChallanForm({ ...BLANK_CHALLAN });
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const TAB_LABELS: Record<Tab, string> = {
    transactions: `TDS Transactions (${transactions.length})`,
    challans: `Challans (${challans.length})`,
    '26q': 'Form 26Q Data',
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>TDS Management</h1>
        <p style={{ color: 'var(--t3)', fontSize: 13, margin: 0 }}>Tax Deducted at Source — 194C / 194J / 194I · Form 26Q data</p>
      </div>

      {/* FY filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="fl" style={{ margin: 0 }}>FY:</label>
        <select value={fy} onChange={(e) => setFy(e.target.value)} className="fsel" style={{ width: 120 }}>
          {['24-25', '25-26', '26-27'].map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        {activeTab === '26q' && (
          <>
            <label className="fl" style={{ margin: 0 }}>Quarter:</label>
            <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="fsel" style={{ width: 80 }}>
              {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {activeTab === 'transactions' && (
            <button onClick={() => setShowCreate(!showCreate)} style={{ padding: '9px 18px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              {showCreate ? 'Cancel' : '+ Record TDS'}
            </button>
          )}
          {activeTab === 'challans' && (
            <button onClick={() => setShowChallan(!showChallan)} style={{ padding: '9px 18px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              {showChallan ? 'Cancel' : '+ Add Challan'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--bd)' }}>
        {(['transactions', 'challans', '26q'] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '11px 22px', border: 'none', marginBottom: -2,
            borderBottom: activeTab === tab ? '3px solid var(--rust)' : '3px solid transparent',
            backgroundColor: 'transparent', color: activeTab === tab ? 'var(--t1)' : 'var(--t3)',
            fontWeight: activeTab === tab ? 700 : 500, cursor: 'pointer', fontSize: 14,
          }}>{TAB_LABELS[tab]}</button>
        ))}
      </div>

      {/* Create TDS Form */}
      {showCreate && activeTab === 'transactions' && (
        <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Record TDS Deduction</h3>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label className="fl">Vendor *</label>
                <select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} required className="fsel">
                  <option value="">— Select vendor —</option>
                  {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">TDS Section *</label>
                <select value={form.section} onChange={(e) => {
                  const s = sections.find((x: any) => x.code === e.target.value);
                  setForm({ ...form, section: e.target.value, tds_rate_pct: s?.rate_individual_pct || 1.0 });
                }} required className="fsel">
                  {sections.map((s: any) => <option key={s.code} value={s.code}>{s.code} — {s.description}</option>)}
                </select>
              </div>
              <div><label className="fl">Payment Date *</label><input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} required className="fi" /></div>
              <div>
                <label className="fl">Gross Amount (₹) *</label>
                <input type="number" step="0.01" min="0.01" value={numericInputValue(form.gross_amount_paise)} onChange={(e) => setForm({ ...form, gross_amount_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} required className="fi" />
              </div>
              <div>
                <label className="fl">TDS Rate % *</label>
                <input type="number" step="0.01" value={form.tds_rate_pct} onChange={(e) => setForm({ ...form, tds_rate_pct: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} required className="fi" />
              </div>
              <div style={{ backgroundColor: 'var(--bg3)', borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>TDS Amount (calculated)</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--rust)' }}>
                  {formatINR(Math.round((form.gross_amount_paise || 0) * 100 * (form.tds_rate_pct || 0) / 100))}
                </span>
              </div>
              <div style={{ gridColumn: '1 / -1' }}><label className="fl">Notes</label><input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="fi" placeholder="Optional notes" /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={createTds.isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                {createTds.isPending ? 'Saving...' : 'Record TDS'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', color: 'var(--t2)', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Deposit form (inline) */}
      {depositingId && (
        <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--amberB)', borderRadius: 10, padding: 16, marginBottom: 24 }}>
          <h4 style={{ margin: '0 0 12px' }}>Mark as Deposited — {depositingId}</h4>
          <form onSubmit={handleDeposit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><label className="fl">Challan No</label><input type="text" value={depositForm.challan_no} onChange={(e) => setDepositForm({ ...depositForm, challan_no: e.target.value })} className="fi" placeholder="ITNS 281 challan no" /></div>
            <div><label className="fl">Challan Date</label><input type="date" value={depositForm.challan_date} onChange={(e) => setDepositForm({ ...depositForm, challan_date: e.target.value })} className="fi" /></div>
            <div><label className="fl">BSR Code</label><input type="text" value={depositForm.bsr_code} onChange={(e) => setDepositForm({ ...depositForm, bsr_code: e.target.value })} className="fi" placeholder="7-digit BSR" /></div>
            <button type="submit" style={{ padding: '9px 18px', backgroundColor: 'var(--sage)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Confirm Deposit</button>
            <button type="button" onClick={() => setDepositingId(null)} style={{ padding: '9px 14px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
          </form>
        </div>
      )}

      {/* TDS Transactions */}
      {activeTab === 'transactions' && (
        transactions.length === 0 ? <p style={{ color: 'var(--t3)' }}>No TDS transactions for FY {fy}.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {transactions.map((t: any) => (
              <div key={t.id} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--t3)', minWidth: 130 }}>{t.id}</span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.vendor_name || t.vendor_id}</div>
                  {t.vendor_pan && <div style={{ fontSize: 11, color: 'var(--t3)' }}>PAN: {t.vendor_pan}</div>}
                </div>
                <Badge label={t.section} variant="blue" />
                <Badge label={`${t.quarter} FY${t.fy}`} variant="purple" />
                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>Gross: {formatINR(t.gross_amount_paise)}</div>
                  <div style={{ fontWeight: 700, color: 'var(--rust)' }}>TDS: {formatINR(t.tds_amount_paise)}</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--t2)' }}>{t.payment_date}</span>
                {t.deposited ? (
                  <Badge label="Deposited" variant="green" />
                ) : (
                  <button onClick={() => { setDepositingId(t.id); setDepositForm({ challan_no: '', challan_date: '', bsr_code: '' }); }}
                    style={{ padding: '4px 12px', fontSize: 12, backgroundColor: 'var(--amberW)', color: 'var(--amber)', border: '1px solid var(--amberB)', borderRadius: 20, cursor: 'pointer', fontWeight: 600 }}>
                    Pending — Deposit
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Challans */}
      {activeTab === 'challans' && (
        <div>
          {showChallan && (
            <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>Record ITNS 281 Challan</h3>
              <form onSubmit={handleChallan}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  <div><label className="fl">Challan Date *</label><input type="date" value={challanForm.challan_date} onChange={(e) => setChallanForm({ ...challanForm, challan_date: e.target.value })} required className="fi" /></div>
                  <div><label className="fl">Section *</label>
                    <select value={challanForm.section} onChange={(e) => setChallanForm({ ...challanForm, section: e.target.value })} className="fsel">
                      {sections.map((s: any) => <option key={s.code} value={s.code}>{s.code}</option>)}
                    </select>
                  </div>
                  <div><label className="fl">BSR Code *</label><input type="text" value={challanForm.bsr_code} onChange={(e) => setChallanForm({ ...challanForm, bsr_code: e.target.value })} required className="fi" placeholder="7-digit bank BSR" /></div>
                  <div><label className="fl">Serial No *</label><input type="text" value={challanForm.challan_serial_no} onChange={(e) => setChallanForm({ ...challanForm, challan_serial_no: e.target.value })} required className="fi" placeholder="5-digit serial" /></div>
                  <div><label className="fl">Amount (₹) *</label><input type="number" step="0.01" value={numericInputValue(challanForm.amount_paise)} onChange={(e) => setChallanForm({ ...challanForm, amount_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} required className="fi" /></div>
                  <div><label className="fl">Quarter</label>
                    <select value={challanForm.quarter} onChange={(e) => setChallanForm({ ...challanForm, quarter: e.target.value })} className="fsel">
                      {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" disabled={createChallan.isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Save Challan</button>
                  <button type="button" onClick={() => setShowChallan(false)} style={{ padding: '10px 20px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
                </div>
              </form>
            </div>
          )}
          {challans.length === 0 ? <p style={{ color: 'var(--t3)' }}>No challans recorded for FY {fy}.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
                {['ID', 'Date', 'Section', 'BSR Code', 'Serial No', 'Amount'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--t2)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {challans.map((c: any) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--t3)' }}>{c.id}</td>
                    <td style={{ padding: '10px 14px' }}>{c.challan_date}</td>
                    <td style={{ padding: '10px 14px' }}><Badge label={c.section} variant="blue" /></td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>{c.bsr_code}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>{c.challan_serial_no}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700 }}>{formatINR(c.amount_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 26Q */}
      {activeTab === '26q' && (
        <div>
          {!q26Data ? <p style={{ color: 'var(--t3)' }}>Select FY and Quarter above.</p> : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                {(q26Data as any).summary?.map((s: any) => (
                  <div key={s.section} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 6 }}>Section {s.section}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--rust)' }}>{formatINR(s.total_tds_paise)}</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{s.txn_count} deductees · Gross {formatINR(s.total_gross_paise)}</div>
                    <div style={{ fontSize: 11, marginTop: 6 }}>
                      <span style={{ color: 'var(--sage)' }}>Deposited: {formatINR(s.deposited_paise)}</span>
                      {s.pending_paise > 0 && <span style={{ color: 'var(--rust)', marginLeft: 8 }}>Pending: {formatINR(s.pending_paise)}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
                  {['Date', 'Vendor / Deductee', 'PAN', 'Section', 'Gross', 'TDS', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--t2)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(q26Data as any).transactions?.map((t: any) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{t.payment_date}</td>
                      <td style={{ padding: '10px 14px' }}>{t.vendor_name}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12 }}>{t.vendor_pan || '—'}</td>
                      <td style={{ padding: '10px 14px' }}><Badge label={t.section} variant="blue" /></td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>{formatINR(t.gross_amount_paise)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--rust)' }}>{formatINR(t.tds_amount_paise)}</td>
                      <td style={{ padding: '10px 14px' }}>{t.deposited ? <Badge label="Deposited" variant="green" /> : <Badge label="Pending" variant="amber" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
