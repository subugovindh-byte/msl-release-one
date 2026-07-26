import React, { useState } from 'react';
import {
  useGSTR1, useGSTR3B, useGSTR9, useDayBook,
  useSalesRegister, usePurchaseRegister,
  useFilingCalendar, useUpdateFilingPeriod,
} from '@/hooks/useApi';
import { formatINR } from '@/utils/format';
import { useToastStore } from '@/store';

type Tab = 'daybook' | 'sales-reg' | 'purchase-reg' | 'gstr1' | 'gstr3b' | 'gstr9' | 'filing';

const TABS: { id: Tab; label: string }[] = [
  { id: 'filing',       label: 'Filing Calendar' },
  { id: 'daybook',      label: 'Day Book' },
  { id: 'sales-reg',    label: 'Sales Register' },
  { id: 'purchase-reg', label: 'Purchase Register' },
  { id: 'gstr1',        label: 'GSTR-1' },
  { id: 'gstr3b',       label: 'GSTR-3B' },
  { id: 'gstr9',        label: 'GSTR-9' },
];

// Compute current financial year dynamically (India: Apr–Mar)
function getCurrentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based
  return month >= 4 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`;
}
function getFYBounds(fy: string): { from: string; to: string } {
  const startYear = parseInt(fy.split('-')[0] ?? '0');
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

const CURRENT_FY = getCurrentFY();
const { from: FY_FROM, to: FY_TO } = getFYBounds(CURRENT_FY);

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid var(--bd)', marginBottom: '24px', flexWrap: 'wrap' }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: '10px 18px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
          fontSize: '13px', fontWeight: active === t.id ? 700 : 500,
          color: active === t.id ? 'var(--t1)' : 'var(--t3)',
          borderBottom: active === t.id ? '3px solid var(--rust)' : '3px solid transparent',
          marginBottom: '-2px',
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
      <label style={{ fontSize: '12px', color: 'var(--t3)' }}>From</label>
      <input type="date" value={from} onChange={e => onFrom(e.target.value)} className="fi" style={{ width: 140 }} />
      <label style={{ fontSize: '12px', color: 'var(--t3)' }}>To</label>
      <input type="date" value={to} onChange={e => onTo(e.target.value)} className="fi" style={{ width: 140 }} />
    </div>
  );
}

function AmtCell({ paise }: { paise: number }) {
  return <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{paise > 0 ? formatINR(paise) : '—'}</td>;
}

function Tbl({ cols, rows, empty = 'No data.' }: { cols: string[]; rows: React.ReactNode[][]; empty?: string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="receipt-tbl" style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
        <thead><tr>{cols.map(c => <th key={c} style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={cols.length} style={{ padding: '20px', textAlign: 'center', color: 'var(--t3)' }}>{empty}</td></tr>
            : rows.map((r, i) => <tr key={i}>{r.map((cell, j) => <React.Fragment key={j}>{typeof cell === 'object' && cell !== null && 'props' in (cell as any) && (cell as any).type === 'td' ? cell : <td style={{ padding: '7px 10px' }}>{cell}</td>}</React.Fragment>)}</tr>)
          }
        </tbody>
      </table>
    </div>
  );
}

// ─── Filing Calendar ───
function FilingCalendar() {
  const { data, isLoading, refetch } = useFilingCalendar(CURRENT_FY);
  const update = useUpdateFilingPeriod();
  const { notify } = useToastStore();
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ filed_date: '', status: 'filed', notes: '' });

  const periods: any[] = data?.periods || [];
  const STATUS_COLOR: Record<string, string> = {
    pending: 'var(--red)', filed: 'var(--sage)', revised: 'var(--amber)', nil: 'var(--t3)',
  };

  const handleSave = async (id: number) => {
    try {
      await update.mutateAsync({ id, data: editForm });
      notify('Filing status updated', 'success');
      setEditId(null);
      refetch();
    } catch { notify('Failed to update', 'error'); }
  };

  if (isLoading) return <p style={{ color: 'var(--t3)' }}>Loading...</p>;

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {(['GSTR1', 'GSTR3B', 'GSTR9'] as const).map(rt => {
          const count = periods.filter(p => p.return_type === rt && p.status === 'filed').length;
          const total = periods.filter(p => p.return_type === rt).length;
          return (
            <div key={rt} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '12px 20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: 4 }}>{rt}</div>
              <div style={{ fontSize: '20px', fontWeight: 700 }}>{count}<span style={{ fontSize: '13px', color: 'var(--t3)', fontWeight: 400 }}>/{total} filed</span></div>
            </div>
          );
        })}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="receipt-tbl" style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['Period', 'Type', 'Due Date', 'Status', 'Filed Date', 'Filed By', 'Actions'].map(c =>
              <th key={c} style={{ padding: '8px 10px', textAlign: 'left' }}>{c}</th>)}
          </tr></thead>
          <tbody>
            {periods.map((p: any) => (
              <tr key={p.id}>
                <td style={{ padding: '7px 10px', fontWeight: 600 }}>{p.period}</td>
                <td style={{ padding: '7px 10px' }}>{p.return_type}</td>
                <td style={{ padding: '7px 10px' }}>{p.due_date}</td>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, backgroundColor: STATUS_COLOR[p.status] + '33', color: STATUS_COLOR[p.status] }}>
                    {p.status}
                  </span>
                </td>
                <td style={{ padding: '7px 10px' }}>{p.filed_date || '—'}</td>
                <td style={{ padding: '7px 10px' }}>{p.filed_by || '—'}</td>
                <td style={{ padding: '7px 10px' }}>
                  {editId === p.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="date" value={editForm.filed_date} onChange={e => setEditForm({ ...editForm, filed_date: e.target.value })} className="fi" style={{ width: 130, fontSize: 11 }} />
                      <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className="fsel" style={{ fontSize: 11 }}>
                        <option value="filed">Filed</option>
                        <option value="nil">Nil Return</option>
                        <option value="revised">Revised</option>
                        <option value="pending">Pending</option>
                      </select>
                      <button onClick={() => handleSave(p.id)} style={{ padding: '3px 10px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Save</button>
                      <button title="Cancel" onClick={() => setEditId(null)} style={{ padding: '3px 8px', border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer', fontSize: 11, backgroundColor: 'transparent', color: 'var(--t2)' }}>×</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditId(p.id); setEditForm({ filed_date: p.filed_date || '', status: 'filed', notes: p.notes || '' }); }}
                      style={{ padding: '3px 10px', border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer', fontSize: 11, backgroundColor: 'var(--bg1)', color: 'var(--t1)' }}>
                      Mark Filed
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Day Book ───
function DayBook({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useDayBook({ from, to, limit: 500 });
  const entries: any[] = data?.entries || [];
  if (isLoading) return <p style={{ color: 'var(--t3)' }}>Loading...</p>;
  return (
    <Tbl
      cols={['Date', 'Type', 'Doc No', 'Party', 'Debit (₹)', 'Credit (₹)', 'Head']}
      rows={entries.map(e => [
        e.date,
        e.doc_type,
        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{e.doc_no}</span>,
        e.party || '—',
        <td style={{ textAlign: 'right' }}>{e.dr_paise > 0 ? formatINR(e.dr_paise) : '—'}</td>,
        <td style={{ textAlign: 'right' }}>{e.cr_paise > 0 ? formatINR(e.cr_paise) : '—'}</td>,
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>{e.ledger_head}</span>,
      ])}
      empty="No transactions in this period."
    />
  );
}

// ─── Sales Register ───
function SalesRegister({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useSalesRegister({ from, to });
  const rows: any[] = data?.invoices || [];
  const totals = rows.reduce((s, r) => ({
    taxable: s.taxable + r.taxable_paise,
    cgst: s.cgst + r.cgst_paise,
    sgst: s.sgst + r.sgst_paise,
    igst: s.igst + r.igst_paise,
    total: s.total + r.total_paise,
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
  if (isLoading) return <p style={{ color: 'var(--t3)' }}>Loading...</p>;
  return (
    <div>
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['Taxable', totals.taxable], ['CGST', totals.cgst], ['SGST', totals.sgst], ['IGST', totals.igst], ['Total', totals.total]].map(([l, v]) => (
          <div key={l as string} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>{l}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{formatINR(v as number)}</div>
          </div>
        ))}
      </div>
      <Tbl
        cols={['Invoice No', 'Date', 'Customer', 'GSTIN', 'State', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Status']}
        rows={rows.map(r => [
          <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.invoice_no}</span>,
          r.date,
          r.customer_name,
          <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{r.customer_gstin || '—'}</span>,
          r.customer_state,
          <AmtCell paise={r.taxable_paise} />,
          <AmtCell paise={r.cgst_paise} />,
          <AmtCell paise={r.sgst_paise} />,
          <AmtCell paise={r.igst_paise} />,
          <AmtCell paise={r.total_paise} />,
          <span style={{ fontSize: 11, color: r.payment_status === 'Paid' ? 'var(--sage)' : 'var(--rust)' }}>{r.payment_status}</span>,
        ])}
        empty="No sales in this period."
      />
    </div>
  );
}

// ─── Purchase Register ───
function PurchaseRegister({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = usePurchaseRegister({ from, to });
  const rows: any[] = data?.purchase_orders || [];
  const totalITC = rows.reduce((s, r) => s + r.gst_paise, 0);
  if (isLoading) return <p style={{ color: 'var(--t3)' }}>Loading...</p>;
  return (
    <div>
      <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 18px', display: 'inline-block', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>Total ITC Available</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--sage)' }}>{formatINR(totalITC)}</div>
      </div>
      <Tbl
        cols={['PO No', 'Date', 'Vendor', 'GSTIN', 'Variety', 'Blocks', 'Taxable', 'GST (ITC)', 'Total', 'Status']}
        rows={rows.map(r => [
          <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.po_no}</span>,
          r.date,
          r.vendor_name,
          <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{r.vendor_gstin || '—'}</span>,
          r.variety,
          r.blocks,
          <AmtCell paise={r.taxable_paise} />,
          <AmtCell paise={r.gst_paise} />,
          <AmtCell paise={r.total_paise} />,
          <span style={{ fontSize: 11 }}>{r.status}</span>,
        ])}
        empty="No purchases in this period."
      />
    </div>
  );
}

// ─── GSTR-1 ───
function GSTR1({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useGSTR1({ from, to });
  const [section, setSection] = useState<'b2b' | 'b2c' | 'cdn' | 'hsn' | 'docs'>('b2b');
  if (isLoading) return <p style={{ color: 'var(--t3)' }}>Loading...</p>;
  if (!data) return null;
  const { b2b = [], b2c_large = [], b2c_small = [], cdnr = [], cdnur = [], hsn_summary = [], doc_summary = [] } = data;

  const SecBtn = ({ id, label }: { id: typeof section; label: string }) => (
    <button onClick={() => setSection(id)} style={{
      padding: '6px 14px', fontSize: 12, border: '1px solid var(--bd)', borderRadius: 6,
      backgroundColor: section === id ? 'var(--rust)' : 'var(--bg1)',
      color: section === id ? 'white' : 'var(--t2)', cursor: 'pointer', fontWeight: section === id ? 600 : 400,
    }}>{label}</button>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <SecBtn id="b2b" label={`B2B (${b2b.length})`} />
        <SecBtn id="b2c" label={`B2C (${b2c_large.length + b2c_small.length})`} />
        <SecBtn id="cdn" label={`CDN/CDNR (${cdnr.length + cdnur.length})`} />
        <SecBtn id="hsn" label={`HSN Summary`} />
        <SecBtn id="docs" label={`Doc Summary`} />
      </div>

      {section === 'b2b' && (
        <Tbl
          cols={['Invoice No', 'Date', 'Customer', 'GSTIN', 'Type', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']}
          rows={b2b.map((r: any) => [
            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.id}</span>,
            r.date, r.customer_name,
            <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{r.customer_gstin}</span>,
            <span style={{ fontSize: 11 }}>{r.supply_type}</span>,
            <AmtCell paise={r.taxable_paise} />,
            <AmtCell paise={r.cgst_paise} />,
            <AmtCell paise={r.sgst_paise} />,
            <AmtCell paise={r.igst_paise} />,
            <AmtCell paise={r.total_paise} />,
          ])}
          empty="No B2B invoices."
        />
      )}
      {section === 'b2c' && (
        <>
          {b2c_large.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>B2C Large (Interstate &gt;₹2.5L)</div>
              <Tbl
                cols={['Invoice No', 'Date', 'Customer', 'State', 'Taxable', 'IGST', 'Total']}
                rows={b2c_large.map((r: any) => [
                  <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.id}</span>,
                  r.date, r.customer_name, r.customer_state,
                  <AmtCell paise={r.taxable_paise} />,
                  <AmtCell paise={r.igst_paise} />,
                  <AmtCell paise={r.total_paise} />,
                ])}
                empty="None."
              />
              <div style={{ height: 20 }} />
            </>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>B2C Small (Consolidated by State)</div>
          <Tbl
            cols={['State', 'Invoices', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']}
            rows={b2c_small.map((r: any) => [
              r.customer_state,
              r.invoice_count,
              <AmtCell paise={r.taxable_paise} />,
              <AmtCell paise={r.cgst_paise} />,
              <AmtCell paise={r.sgst_paise} />,
              <AmtCell paise={r.igst_paise} />,
              <AmtCell paise={r.total_paise} />,
            ])}
            empty="No B2C sales."
          />
        </>
      )}
      {section === 'cdn' && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>CDNR — Against Registered</div>
          <Tbl
            cols={['Note No', 'Date', 'Type', 'Customer', 'GSTIN', 'Ref Invoice', 'Reason', 'Taxable', 'GST', 'Total']}
            rows={cdnr.map((r: any) => [
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.id}</span>,
              r.date,
              <span style={{ fontWeight: 600, color: r.type === 'credit' ? 'var(--sage)' : 'var(--rust)' }}>{r.type.toUpperCase()}</span>,
              r.customer_name,
              <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{r.customer_gstin}</span>,
              r.ref_invoice_id || '—',
              r.reason,
              <AmtCell paise={r.taxable_paise} />,
              <AmtCell paise={(r.cgst_paise + r.sgst_paise + r.igst_paise)} />,
              <AmtCell paise={r.total_paise} />,
            ])}
            empty="No CDNR entries."
          />
          {cdnur.length > 0 && (
            <>
              <div style={{ height: 20 }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>CDNUR — Against Unregistered</div>
              <Tbl
                cols={['Note No', 'Date', 'Type', 'Customer', 'Reason', 'Taxable', 'Total']}
                rows={cdnur.map((r: any) => [
                  <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.id}</span>,
                  r.date,
                  <span style={{ fontWeight: 600, color: r.type === 'credit' ? 'var(--sage)' : 'var(--rust)' }}>{r.type.toUpperCase()}</span>,
                  r.customer_name, r.reason,
                  <AmtCell paise={r.taxable_paise} />,
                  <AmtCell paise={r.total_paise} />,
                ])}
                empty="No CDNUR entries."
              />
            </>
          )}
        </>
      )}
      {section === 'hsn' && (
        <Tbl
          cols={['HSN', 'UOM', 'Total Qty', 'Taxable', 'CGST', 'SGST', 'IGST']}
          rows={hsn_summary.map((r: any) => [
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.hsn}</span>,
            r.uom, r.total_qty?.toFixed(2),
            <AmtCell paise={r.taxable_paise} />,
            <AmtCell paise={r.cgst_paise} />,
            <AmtCell paise={r.sgst_paise} />,
            <AmtCell paise={r.igst_paise} />,
          ])}
          empty="No data."
        />
      )}
      {section === 'docs' && (
        <Tbl
          cols={['Document Type', 'Issued', 'Cancelled', 'From No', 'To No']}
          rows={doc_summary.map((r: any) => [r.doc_type, r.issued, r.cancelled, r.from_no || '—', r.to_no || '—'])}
          empty="No documents."
        />
      )}
    </div>
  );
}

// ─── GSTR-3B ───
function GSTR3B({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useGSTR3B({ from, to });
  if (isLoading) return <p style={{ color: 'var(--t3)' }}>Loading...</p>;
  if (!data) return null;
  const out = data['3_1_outward'] || {};
  const cn  = data['3_1_1_credit_notes'] || {};
  const itc = data['4_itc'] || {};
  const net = data.net_payable || {};

  const Row = ({ label, cgst, sgst, igst }: { label: string; cgst: number; sgst: number; igst: number }) => (
    <tr>
      <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{label}</td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatINR(cgst)}</td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatINR(sgst)}</td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatINR(igst)}</td>
      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{formatINR(cgst + sgst + igst)}</td>
    </tr>
  );

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ backgroundColor: '#1a1612', color: 'white' }}>
            {['Description', 'CGST', 'SGST', 'IGST', 'Total'].map(h =>
              <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Description' ? 'left' : 'right' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr style={{ backgroundColor: 'var(--bg2)' }}>
            <td colSpan={5} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1 }}>3.1 — Outward Taxable Supplies</td>
          </tr>
          <Row label="Taxable Sales" cgst={out.cgst || 0} sgst={out.sgst || 0} igst={out.igst || 0} />
          <Row label="Less: Credit Notes" cgst={cn.cgst_paise || 0} sgst={cn.sgst_paise || 0} igst={cn.igst_paise || 0} />
          <tr style={{ backgroundColor: 'var(--bg2)' }}>
            <td colSpan={5} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1 }}>4 — ITC Available</td>
          </tr>
          <Row label="ITC from Purchases" cgst={itc.cgst_paise || 0} sgst={itc.sgst_paise || 0} igst={0} />
          <tr style={{ backgroundColor: 'var(--bg2)' }}>
            <td colSpan={5} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1 }}>6 — Net Tax Payable</td>
          </tr>
          <tr style={{ backgroundColor: 'var(--amberW)' }}>
            <td style={{ padding: '10px 12px', fontWeight: 700 }}>Net GST Payable</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: (net.cgst_paise || 0) > 0 ? 'var(--rust)' : 'inherit' }}>{formatINR(net.cgst_paise || 0)}</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: (net.sgst_paise || 0) > 0 ? 'var(--rust)' : 'inherit' }}>{formatINR(net.sgst_paise || 0)}</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: (net.igst_paise || 0) > 0 ? 'var(--rust)' : 'inherit' }}>{formatINR(net.igst_paise || 0)}</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 15, color: 'var(--rust)' }}>{formatINR(net.total_paise || 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── GSTR-9 Annual ───
function GSTR9() {
  const [fy, setFy] = useState(CURRENT_FY);
  const { data, isLoading, refetch } = useGSTR9(fy);

  if (isLoading) return <p style={{ color: 'var(--t3)' }}>Loading...</p>;
  if (!data) return null;
  const out = data.pt4_outward_taxable || {};
  const itc = data.pt5_itc || {};
  const paid = data.pt6_tax_paid || {};
  const cash = data.cashflow || {};

  const KPI = ({ label, value, color }: { label: string; value: number; color?: string }) => (
    <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '12px 20px', minWidth: 140 }}>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--t1)' }}>{formatINR(value)}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: 'var(--t3)' }}>Financial Year</label>
        <select value={fy} onChange={e => { setFy(e.target.value); }} className="fsel" style={{ width: 120 }}>
          {['2024-25', '2025-26', '2026-27', '2027-28'].map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <button onClick={() => refetch()} style={{ padding: '6px 14px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Load</button>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <KPI label="Total Taxable Sales" value={out.taxable_paise || 0} />
        <KPI label="CGST Output" value={out.cgst || 0} color="var(--rust)" />
        <KPI label="SGST Output" value={out.sgst || 0} color="var(--rust)" />
        <KPI label="IGST Output" value={out.igst || 0} color="var(--rust)" />
        <KPI label="ITC Available" value={itc.total_paise || 0} color="var(--sage)" />
        <KPI label="Net Tax Paid" value={(paid.cgst || 0) + (paid.sgst || 0) + (paid.igst || 0)} color="var(--amber)" />
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KPI label="Collections Received" value={cash.collections_paise || 0} color="var(--sage)" />
        <KPI label="Vendor Payments Made" value={cash.payments_paise || 0} color="var(--rust)" />
      </div>
      {data.hsn_breakdown?.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>HSN-wise Breakdown</div>
          <Tbl
            cols={['HSN', 'Qty', 'Taxable']}
            rows={data.hsn_breakdown.map((r: any) => [
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.hsn}</span>,
              r.qty?.toFixed(2),
              <AmtCell paise={r.taxable_paise} />,
            ])}
            empty="No data."
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───
export function CompliancePage() {
  const [activeTab, setActiveTab] = useState<Tab>('filing');
  const [from, setFrom] = useState(FY_FROM);
  const [to, setTo] = useState(FY_TO);

  const showDateRange = activeTab !== 'filing' && activeTab !== 'gstr9';

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>GST Compliance & Reports</h1>
        <p style={{ color: 'var(--t3)', fontSize: 13 }}>Tax filing, day book, sales/purchase registers, GSTR-1/3B/9</p>
      </div>
      <TabBar active={activeTab} onChange={setActiveTab} />
      {showDateRange && <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />}
      {activeTab === 'filing'       && <FilingCalendar />}
      {activeTab === 'daybook'      && <DayBook from={from} to={to} />}
      {activeTab === 'sales-reg'    && <SalesRegister from={from} to={to} />}
      {activeTab === 'purchase-reg' && <PurchaseRegister from={from} to={to} />}
      {activeTab === 'gstr1'        && <GSTR1 from={from} to={to} />}
      {activeTab === 'gstr3b'       && <GSTR3B from={from} to={to} />}
      {activeTab === 'gstr9'        && <GSTR9 />}
    </div>
  );
}
