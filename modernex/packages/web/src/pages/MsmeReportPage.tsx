import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api as apiClient } from '@/utils/api';
import { formatINR } from '@/utils/format';
import { useToastStore } from '@/store';

type Tab = 'vendors' | 'outstanding' | 'interest' | 'form-i' | 'register';

const TODAY = new Date().toISOString().slice(0, 10);
const THIS_YEAR = new Date().getFullYear();
const MSME_RATE = 27; // 3× RBI repo rate per MSMED Act Sec 16

// ── API hooks ─────────────────────────────────────────────────────────────────
function useMsmeVendors() {
  return useQuery({
    queryKey: ['msme', 'vendors'],
    queryFn: () => apiClient.get<any>('/msme/vendors'),
  });
}

function useMsmeOutstanding() {
  return useQuery({
    queryKey: ['msme', 'outstanding'],
    queryFn: () => apiClient.get<any>('/msme/outstanding'),
  });
}

function useMsmeInterest(params: { from_date?: string; to_date?: string; vendor_id?: string }) {
  return useQuery({
    queryKey: ['msme', 'interest', params],
    queryFn: () => apiClient.get<any>('/msme/interest', { params: params as any }),
    enabled: !!(params.from_date && params.to_date),
  });
}

function useMsmeFormI(halfYear?: string) {
  return useQuery({
    queryKey: ['msme', 'form-i', halfYear],
    queryFn: () => apiClient.get<any>('/msme/form-i', { params: halfYear ? { half_year: halfYear } : {} }),
  });
}

function useMsmePaymentRegister(params: { from_date?: string; to_date?: string; vendor_id?: string }) {
  return useQuery({
    queryKey: ['msme', 'register', params],
    queryFn: () => apiClient.get<any>('/msme/payment-register', { params: params as any }),
  });
}

function useLogMsmeInterest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiClient.post<any>('/msme/interest-log', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['msme'] }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function P(paise: number) {
  return formatINR(paise / 100);
}

function AgeBadge({ days }: { days: number }) {
  const color = days > 90 ? '#ef4444' : days > 45 ? '#f59e0b' : '#22c55e';
  return (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, backgroundColor: color + '22', color }}>
      {days}d
    </span>
  );
}

function StatusBadge({ paid }: { paid: boolean }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, backgroundColor: paid ? '#22c55e22' : '#ef444422', color: paid ? '#22c55e' : '#ef4444' }}>
      {paid ? 'PAID' : 'PENDING'}
    </span>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', minWidth: 160 }}>
      <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--t1)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function VendorsTab() {
  const { data, isLoading } = useMsmeVendors();
  const vendors = data?.vendors || [];

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <SummaryCard label="MSME Vendors" value={String(vendors.length)} />
        <SummaryCard
          label="Total Outstanding"
          value={P(vendors.reduce((s: number, v: any) => s + (v.outstanding_paise || 0), 0))}
          color="var(--t2)"
        />
        <SummaryCard
          label="Overdue Vendors"
          value={String(vendors.filter((v: any) => v.has_overdue).length)}
          color="#ef4444"
        />
        <SummaryCard label="Payment Limit" value="45 days" sub="MSMED Act 2006" />
        <SummaryCard label="Interest Rate" value={`${MSME_RATE}% p.a.`} sub="3× RBI Repo Rate" color="#f59e0b" />
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--t3)', padding: 20 }}>Loading…</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)' }}>
              {['Vendor', 'MSME No.', 'GSTIN', 'Category', 'POs', 'Outstanding', 'Oldest PO', 'Status'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--t3)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>No MSME vendors registered. Mark vendors as MSME in the Vendors master.</td></tr>
            ) : vendors.map((v: any) => (
              <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{v.name}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{v.msme_number || '—'}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{v.gstin || '—'}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t3)' }}>{v.msme_category || 'Micro'}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{v.total_pos || 0}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{P(v.outstanding_paise || 0)}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t3)' }}>{v.oldest_open_po_date || '—'}</td>
                <td style={{ padding: '8px 12px' }}>
                  {v.has_overdue
                    ? <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'var(--redW)', color: 'var(--red)' }}>OVERDUE</span>
                    : <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'var(--sageW)', color: 'var(--sage)' }}>CURRENT</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OutstandingTab() {
  const { data, isLoading } = useMsmeOutstanding();
  const rows = data?.outstanding || [];
  const summary = data?.summary || {};
  const logInterest = useLogMsmeInterest();
  const { notify } = useToastStore();

  const handleLogInterest = async (row: any) => {
    if (!row.accrued_interest_paise) return;
    try {
      await logInterest.mutateAsync({
        vendor_id: row.vendor_id,
        po_id: row.po_id,
        invoice_date: row.po_date,
        amount_paise: row.total_paise,
        payment_date: TODAY,
      });
      notify('Interest logged to MSME ledger', 'success');
    } catch {
      notify('Failed to log interest', 'error');
    }
  };

  return (
    <div>
      {summary.overdueCount > 0 && (
        <div style={{ background: 'var(--redW)', border: '1px solid var(--redB)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: 'var(--red)' }}>
          <strong>⚠ {summary.overdueCount} PO(s) overdue</strong> — MSMED Act Sec 16 requires {MSME_RATE}% p.a. interest on amounts unpaid beyond 45 days.
          Total accrued interest: <strong>{P(summary.totalAccruedInterest || 0)}</strong>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <SummaryCard label="Total Outstanding" value={P(summary.totalOutstanding || 0)} />
        <SummaryCard label="Overdue (>45 days)" value={P(summary.totalOverdue || 0)} color="#ef4444" />
        <SummaryCard label="Accrued Interest" value={P(summary.totalAccruedInterest || 0)} color="#f59e0b" sub="27% p.a. on overdue" />
        <SummaryCard label="Overdue POs" value={String(summary.overdueCount || 0)} color="#ef4444" />
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--t3)', padding: 20 }}>Loading…</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)' }}>
              {['Vendor', 'PO Date', 'Due Date', 'Amount', 'Age', 'Overdue Days', 'Accrued Interest', 'Action'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--t3)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>No outstanding MSME POs</td></tr>
            ) : rows.map((r: any) => (
              <tr key={r.po_id} style={{ borderBottom: '1px solid var(--border)', background: r.overdue_days > 0 ? '#ef444408' : undefined }}>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.vendor_name}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t3)' }}>{r.po_date}</td>
                <td style={{ padding: '8px 12px', color: r.overdue_days > 0 ? '#ef4444' : 'var(--t2)' }}>{r.due_date}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{P(r.total_paise)}</td>
                <td style={{ padding: '8px 12px' }}><AgeBadge days={r.age_days} /></td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: r.overdue_days > 0 ? '#ef4444' : 'var(--t3)' }}>
                  {r.overdue_days > 0 ? `${r.overdue_days}d` : '—'}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: r.accrued_interest_paise > 0 ? 700 : 400, color: r.accrued_interest_paise > 0 ? '#f59e0b' : 'var(--t3)' }}>
                  {r.accrued_interest_paise > 0 ? P(r.accrued_interest_paise) : '—'}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  {r.accrued_interest_paise > 0 && (
                    <button
                      onClick={() => handleLogInterest(r)}
                      style={{ fontSize: 10, padding: '3px 10px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent', color: 'var(--t2)' }}
                    >
                      Log Interest
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function InterestTab() {
  const [from, setFrom] = useState(`${THIS_YEAR}-04-01`);
  const [to, setTo] = useState(TODAY);
  const [vendorId, setVendorId] = useState('');
  const { data: vendorsData } = useMsmeVendors();
  const { data, isLoading } = useMsmeInterest({ from_date: from, to_date: to, vendor_id: vendorId || undefined });

  const vendors = vendorsData?.vendors || [];
  const rows = data?.interest || [];
  const summary = data?.summary || {};

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: 'var(--t3)' }}>
          From<br />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg2)', color: 'var(--t1)', marginTop: 3 }} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--t3)' }}>
          To<br />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg2)', color: 'var(--t1)', marginTop: 3 }} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--t3)' }}>
          Vendor<br />
          <select value={vendorId} onChange={e => setVendorId(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg2)', color: 'var(--t1)', marginTop: 3 }}>
            <option value="">All MSME Vendors</option>
            {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <SummaryCard label="Total Overdue" value={P(summary.totalOverduePaise || 0)} color="#ef4444" />
        <SummaryCard label="Total Interest" value={P(summary.totalInterestPaise || 0)} color="#f59e0b" />
        <SummaryCard label="Interest Rate" value={`${MSME_RATE}% p.a.`} sub="MSMED Act Sec 16" />
        <SummaryCard label="Overdue POs" value={String(summary.overdueCount || 0)} />
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--t3)', padding: 20 }}>Loading…</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)' }}>
              {['Vendor', 'MSME No.', 'PO Date', 'Due Date', 'Principal', 'Overdue Days', 'Interest (27% p.a.)', 'Total Payable'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--t3)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>No overdue MSME payments in this period</td></tr>
            ) : rows.map((r: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.vendor_name}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t3)' }}>{r.msme_number || '—'}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t3)' }}>{r.po_date}</td>
                <td style={{ padding: '8px 12px', color: 'var(--red)' }}>{r.due_date}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{P(r.total_paise)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>{r.overdue_days}d</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--amber)' }}>{P(r.accrued_interest_paise || 0)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{P((r.total_paise || 0) + (r.accrued_interest_paise || 0))}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={{ background: 'var(--bg2)', fontWeight: 700 }}>
                <td colSpan={4} style={{ padding: '8px 12px' }}>TOTAL</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{P(rows.reduce((s: number, r: any) => s + r.total_paise, 0))}</td>
                <td style={{ padding: '8px 12px' }} />
                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--amber)' }}>{P(rows.reduce((s: number, r: any) => s + (r.accrued_interest_paise || 0), 0))}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{P(rows.reduce((s: number, r: any) => s + r.total_paise + (r.accrued_interest_paise || 0), 0))}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FormITab() {
  const [halfYear, setHalfYear] = useState(() => {
    const m = new Date().getMonth() + 1;
    return m <= 6 ? 'H1' : 'H2';
  });
  const { data, isLoading } = useMsmeFormI(halfYear);
  const form = data?.form_i;

  const handlePrint = () => window.print();

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 20 }}>
        <label style={{ fontSize: 11, color: 'var(--t3)' }}>
          Half Year<br />
          <select value={halfYear} onChange={e => setHalfYear(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg2)', color: 'var(--t1)', marginTop: 3 }}>
            <option value="H1">H1 (Apr–Sep)</option>
            <option value="H2">H2 (Oct–Mar)</option>
          </select>
        </label>
        <button onClick={handlePrint} style={{ fontSize: 11, padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent', color: 'var(--t2)' }}>
          Print / PDF
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--t3)', padding: 20 }}>Loading…</div>
      ) : !form ? (
        <div style={{ color: 'var(--t3)', padding: 20 }}>No data</div>
      ) : (
        <div style={{ maxWidth: 800 }}>
          {/* Form I Header */}
          <div style={{ border: '2px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 16 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase' }}>Form I</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>Half-Yearly Return under the Micro, Small and Medium Enterprises Development Act, 2006</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Section 22 — MSMED Act 2006</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
              <div><span style={{ color: 'var(--t3)' }}>Name of Buyer:</span> <strong>{form.buyer?.name || '—'}</strong></div>
              <div><span style={{ color: 'var(--t3)' }}>GSTIN:</span> <strong>{form.buyer?.gstin || '—'}</strong></div>
              <div><span style={{ color: 'var(--t3)' }}>PAN:</span> <strong>{form.buyer?.pan || '—'}</strong></div>
              <div><span style={{ color: 'var(--t3)' }}>Period:</span> <strong>{halfYear === 'H1' ? 'April – September' : 'October – March'} {THIS_YEAR}</strong></div>
              <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--t3)' }}>Address:</span> <strong>{form.buyer?.address || '—'}</strong></div>
            </div>
          </div>

          {/* Supplier wise detail */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ background: 'var(--bg2)', padding: '10px 16px', fontWeight: 700, fontSize: 12 }}>
              Details of Amounts Due and Remaining Unpaid to Micro/Small Enterprises
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg2)' }}>
                  {['#', 'Supplier Name', 'MSME No.', 'GSTIN', 'No. of POs', 'Principal Overdue', 'Interest @ 27% p.a.'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--t3)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(!form.suppliers || form.suppliers.length === 0) ? (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>No overdue MSME payments for this period</td></tr>
                ) : form.suppliers.map((s: any, i: number) => (
                  <tr key={s.vendor_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--t3)' }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{s.vendor_name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{s.msme_number || '—'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{s.vendor_gstin || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{s.orders?.length || 0}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{P(s.total_paise)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--amber)', fontWeight: 700 }}>
                      {P(s.orders?.reduce((sum: number, o: any) => sum + (o.interest_paise || 0), 0) || 0)}
                    </td>
                  </tr>
                ))}
                {form.suppliers && form.suppliers.length > 0 && (
                  <tr style={{ background: 'var(--bg2)', fontWeight: 700 }}>
                    <td colSpan={5} style={{ padding: '8px 12px' }}>TOTAL</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{P(form.total_outstanding_paise || 0)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--amber)' }}>
                      {P(form.suppliers?.reduce((s: number, sup: any) => s + (sup.orders?.reduce((si: number, o: any) => si + (o.interest_paise || 0), 0) || 0), 0) || 0)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 11, color: 'var(--t3)', padding: '8px 0' }}>
            Generated: {form.generated_at ? new Date(form.generated_at).toLocaleString('en-IN') : '—'} ·
            {' '}Vendor count: {form.vendor_count || 0} ·
            {' '}Filed under MSMED Act 2006, Section 22 read with MSME Development (Amendment) Act 2018
          </div>
        </div>
      )}
    </div>
  );
}

function RegisterTab() {
  const [from, setFrom] = useState(`${THIS_YEAR}-04-01`);
  const [to, setTo] = useState(TODAY);
  const [vendorId, setVendorId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'overdue'>('all');
  const { data: vendorsData } = useMsmeVendors();
  const { data, isLoading } = useMsmePaymentRegister({ from_date: from, to_date: to, vendor_id: vendorId || undefined });

  const vendors = vendorsData?.vendors || [];
  const allRows: any[] = data?.register || [];
  const summary = data?.summary || {};

  const rows = allRows.filter(r => {
    if (statusFilter === 'paid') return r.paid;
    if (statusFilter === 'pending') return !r.paid;
    if (statusFilter === 'overdue') return r.overdue_days > 0;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: 'var(--t3)' }}>
          From<br />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg2)', color: 'var(--t1)', marginTop: 3 }} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--t3)' }}>
          To<br />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg2)', color: 'var(--t1)', marginTop: 3 }} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--t3)' }}>
          Vendor<br />
          <select value={vendorId} onChange={e => setVendorId(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg2)', color: 'var(--t1)', marginTop: 3 }}>
            <option value="">All</option>
            {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 4, marginTop: 18 }}>
          {(['all', 'paid', 'pending', 'overdue'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{ fontSize: 11, padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: statusFilter === s ? 'var(--t1)' : 'transparent', color: statusFilter === s ? 'var(--bg1)' : 'var(--t2)', textTransform: 'capitalize' }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <SummaryCard label="Total POs" value={String(summary.total || 0)} />
        <SummaryCard label="Paid" value={String(summary.paid || 0)} color="#22c55e" />
        <SummaryCard label="Pending" value={String(summary.pending || 0)} color="#f59e0b" />
        <SummaryCard label="Overdue (>45d)" value={String(summary.overdue || 0)} color="#ef4444" />
        <SummaryCard label="Pending Amount" value={P(summary.pendingAmount || 0)} color="#f59e0b" />
        <SummaryCard label="Overdue Amount" value={P(summary.overdueAmount || 0)} color="#ef4444" />
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--t3)', padding: 20 }}>Loading…</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)' }}>
              {['PO Date', 'Vendor', 'MSME No.', 'Variety', 'Amount', 'Age', 'Overdue Days', 'Status'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--t3)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>No records</td></tr>
            ) : rows.map((r: any) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: r.overdue_days > 0 ? '#ef444408' : undefined }}>
                <td style={{ padding: '8px 12px', color: 'var(--t3)' }}>{r.date}</td>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.vendor_name}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t3)', fontSize: 11 }}>{r.msme_number || '—'}</td>
                <td style={{ padding: '8px 12px' }}>{r.variety || '—'}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{P(r.total_paise)}</td>
                <td style={{ padding: '8px 12px' }}><AgeBadge days={r.age_days} /></td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: r.overdue_days > 0 ? '#ef4444' : 'var(--t3)' }}>
                  {r.overdue_days > 0 ? `${r.overdue_days}d` : '—'}
                </td>
                <td style={{ padding: '8px 12px' }}><StatusBadge paid={!!r.paid} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function MsmeReportPage() {
  const [tab, setTab] = useState<Tab>('vendors');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'vendors', label: 'MSME Vendors' },
    { id: 'outstanding', label: 'Outstanding + Interest' },
    { id: 'interest', label: 'Interest Calculator' },
    { id: 'form-i', label: 'Form I (Half-Yearly)' },
    { id: 'register', label: 'Payment Register' },
  ];

  return (
    <div style={{ padding: '20px 24px', fontFamily: "'IBM Plex Mono', monospace" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>MSME Compliance</h1>
          <span style={{ fontSize: 11, color: 'var(--t3)', padding: '2px 8px', background: 'var(--bg2)', borderRadius: 4, border: '1px solid var(--border)' }}>
            MSMED Act 2006 · Sec 15–16 · 45-day rule · {MSME_RATE}% p.a. interest
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
          Micro, Small and Medium Enterprises Development Act 2006 compliance module
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', fontSize: 12, fontFamily: 'inherit', border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--t1)' : '2px solid transparent',
              background: 'transparent', cursor: 'pointer',
              color: tab === t.id ? 'var(--t1)' : 'var(--t3)',
              fontWeight: tab === t.id ? 700 : 400,
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'vendors'      && <VendorsTab />}
      {tab === 'outstanding'  && <OutstandingTab />}
      {tab === 'interest'     && <InterestTab />}
      {tab === 'form-i'       && <FormITab />}
      {tab === 'register'     && <RegisterTab />}
    </div>
  );
}
