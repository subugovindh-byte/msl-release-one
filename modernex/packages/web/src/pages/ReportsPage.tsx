import { useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { useQuery } from '@tanstack/react-query';
import { api as apiClient } from '@/utils/api';
import { useInvoices, useStockValuation, useDepreciationSchedule } from '@/hooks/useApi';
import { DataGridTable } from '@/components/DataGridTable';
import { formatINR } from '@/utils/format';

type Tab = 'sales' | 'pl' | 'gstr' | 'cashbook' | 'bankbook' | 'outstanding' | 'cashflow' | 'balancesheet' | 'ratios' | 'ledger' | 'stock' | 'depreciation';

const TAB_LABELS: Record<Tab, string> = {
  sales: 'Sales MIS', pl: 'P&L', gstr: 'GSTR',
  cashbook: 'Cash Book', bankbook: 'Bank Book',
  outstanding: 'AR/AP Aging', cashflow: 'Cash Flow',
  balancesheet: 'Balance Sheet', ratios: 'Ratio Analysis', ledger: 'Ledger',
  stock: 'Stock Valuation', depreciation: 'Depreciation',
};

const TabBtn = ({ tab, active, label, onClick }: any) => (
  <button onClick={() => onClick(tab)} style={{
    padding: '10px 16px', border: 'none', marginBottom: -2,
    borderBottom: active === tab ? '3px solid var(--rust)' : '3px solid transparent',
    backgroundColor: 'transparent', color: active === tab ? 'var(--t1)' : 'var(--t3)',
    fontWeight: active === tab ? 700 : 500, cursor: 'pointer', fontSize: 12,
    textTransform: 'uppercase', whiteSpace: 'nowrap',
  }}>{label}</button>
);

const today = new Date().toISOString().slice(0, 10);
const fyStart = new Date().getMonth() >= 3
  ? `${new Date().getFullYear()}-04-01`
  : `${new Date().getFullYear() - 1}-04-01`;

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('sales');
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today);
  const [ledgerAccId, setLedgerAccId] = useState('');

  const { data: invoicesData } = useInvoices({});
  const invoices: any[] = invoicesData?.invoices || [];
  const { data: stockData } = useStockValuation();
  const { data: depData } = useDepreciationSchedule();

  // ── Fetch current tab data ──────────────────────────────────────────────────
  const { data: plData } = useQuery({
    queryKey: ['reports', 'pnl', from, to],
    queryFn: () => apiClient.get(`/reports/pnl?from=${from}&to=${to}`).then((r: any) => r),
    enabled: activeTab === 'pl',
  });
  const { data: gstr3bData } = useQuery({
    queryKey: ['reports', 'gstr3b', from, to],
    queryFn: () => apiClient.get(`/reports/gstr3b?from=${from}&to=${to}`).then((r: any) => r),
    enabled: activeTab === 'gstr',
  });
  const { data: cashBookData } = useQuery({
    queryKey: ['reports', 'cash-book', from, to],
    queryFn: () => apiClient.get(`/reports/cash-book?from=${from}&to=${to}`).then((r: any) => r),
    enabled: activeTab === 'cashbook',
  });
  const { data: bankBookData } = useQuery({
    queryKey: ['reports', 'bank-book', from, to],
    queryFn: () => apiClient.get(`/reports/bank-book?from=${from}&to=${to}`).then((r: any) => r),
    enabled: activeTab === 'bankbook',
  });
  const { data: arAgingData } = useQuery({
    queryKey: ['reports', 'ar-aging'],
    queryFn: () => apiClient.get('/reports/ar-aging').then((r: any) => r),
    enabled: activeTab === 'outstanding',
  });
  const { data: apAgingData } = useQuery({
    queryKey: ['reports', 'ap-aging'],
    queryFn: () => apiClient.get('/reports/ap-aging').then((r: any) => r),
    enabled: activeTab === 'outstanding',
  });
  const { data: cashFlowData } = useQuery({
    queryKey: ['reports', 'cash-flow', from, to],
    queryFn: () => apiClient.get(`/reports/cash-flow?from=${from}&to=${to}`).then((r: any) => r),
    enabled: activeTab === 'cashflow',
  });
  const { data: bsData } = useQuery({
    queryKey: ['reports', 'balance-sheet'],
    queryFn: () => apiClient.get('/reports/balance-sheet').then((r: any) => r),
    enabled: activeTab === 'balancesheet',
  });
  const { data: ratioData } = useQuery({
    queryKey: ['reports', 'ratio-analysis'],
    queryFn: () => apiClient.get('/reports/ratio-analysis').then((r: any) => r),
    enabled: activeTab === 'ratios',
  });
  const { data: plRealData } = useQuery({
    queryKey: ['reports', 'pl-real'],
    queryFn: () => apiClient.get('/reports/pl-real').then((r: any) => r),
    enabled: activeTab === 'pl',
  });
  const { data: coaData } = useQuery({
    queryKey: ['coa', 'accounts', { active: true }],
    queryFn: () => apiClient.get('/coa/accounts?active=true').then((r: any) => r),
    enabled: activeTab === 'ledger',
  });
  const { data: ledgerData } = useQuery({
    queryKey: ['reports', 'ledger', ledgerAccId, from, to],
    queryFn: () => apiClient.get(`/reports/ledger/${ledgerAccId}?from=${from}&to=${to}`).then((r: any) => r),
    enabled: !!ledgerAccId && activeTab === 'ledger',
  });

  const revenue = invoices.reduce((s, i) => s + i.taxable_paise, 0);
  const gstCollected = invoices.reduce((s, i) => s + (i.cgst_paise + i.sgst_paise + i.igst_paise), 0);

  const salesColDefs: ColDef[] = [
    { headerName: 'Invoice', field: 'id', minWidth: 140, pinned: 'left' },
    { headerName: 'Date', field: 'date', minWidth: 110, valueFormatter: (p) => p.value ? new Date(p.value).toLocaleDateString('en-IN') : '—' },
    { headerName: 'Customer', field: 'customer_name', minWidth: 160, flex: 2 },
    { headerName: 'Taxable', field: 'taxable_paise', minWidth: 120, type: 'numericColumn', valueFormatter: (p) => formatINR(p.value) },
    { headerName: 'GST', colId: 'gst', minWidth: 110, type: 'numericColumn', valueGetter: (p) => (p.data?.cgst_paise || 0) + (p.data?.sgst_paise || 0) + (p.data?.igst_paise || 0), valueFormatter: (p) => formatINR(p.value) },
    { headerName: 'Total', field: 'total_paise', minWidth: 120, type: 'numericColumn', valueFormatter: (p) => formatINR(p.value) },
    { headerName: 'Status', field: 'paid', minWidth: 90, cellRenderer: (p: any) => <StatusBadge paid={p.value} /> },
  ];

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ marginBottom: 6 }}>Reports</h1>
        <p style={{ color: 'var(--t3)', fontSize: 12, margin: 0 }}>MIS · P&L · GSTR · Cash Book · Bank Book · Aging · Balance Sheet · Ratios</p>
      </div>

      {/* Date range */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><label className="fl">From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="fi" /></div>
        <div><label className="fl">To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className="fi" /></div>
        <button onClick={() => { setFrom(fyStart); setTo(today); }} style={{ padding: '8px 14px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'var(--bg1)', cursor: 'pointer', fontSize: 12 }}>This FY</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 24, borderBottom: '2px solid var(--bd)', overflowX: 'auto' }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map(tab => (
          <TabBtn key={tab} tab={tab} active={activeTab} label={TAB_LABELS[tab]} onClick={setActiveTab} />
        ))}
      </div>

      {/* ── SALES MIS ────────────────────────────────────────────────────────── */}
      {activeTab === 'sales' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <MetricCard label="Revenue" value={formatINR(revenue)} />
            <MetricCard label="GST Collected" value={formatINR(gstCollected)} />
            <MetricCard label="Invoices" value={String(invoices.length)} />
            <MetricCard label="Avg Invoice" value={invoices.length > 0 ? formatINR(Math.round(revenue / invoices.length)) : '—'} />
          </div>
          <DataGridTable rowData={invoices} columnDefs={salesColDefs} getRowId={(p) => p.data.id} emptyMessage="No invoices found." height={480} />
        </div>
      )}

      {/* ── P&L ──────────────────────────────────────────────────────────────── */}
      {activeTab === 'pl' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
          {/* Real P&L from COA */}
          <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 20 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>P&L — From Chart of Accounts</h3>
            {plRealData && (
              <>
                <PLSection title="INCOME" items={(plRealData as any)?.income_accounts || []} />
                <div style={{ height: 1, backgroundColor: 'var(--bd)', margin: '12px 0' }} />
                <PLSection title="EXPENSES" items={(plRealData as any)?.expense_accounts || []} />
                <div style={{ height: 2, backgroundColor: 'var(--bd)', margin: '16px 0 12px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
                  <span>NET PROFIT</span>
                  <span style={{ color: (plRealData as any)?.totals?.net_profit_paise >= 0 ? '#2e7d32' : 'var(--rust)' }}>
                    {formatINR((plRealData as any)?.totals?.net_profit_paise || 0)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'right', marginTop: 4 }}>
                  Margin: {(plRealData as any)?.totals?.net_profit_margin_pct}%
                </div>
              </>
            )}
          </div>
          {/* Operational P&L */}
          {plData && (
            <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 20 }}>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>Operational P&L — {from} to {to}</h3>
              <PLRow label="Revenue" value={(plData as any)?.income?.revenue_paise} type="credit" />
              <PLRow label="Raw Material" value={(plData as any)?.expenses?.raw_material_paise} type="debit" />
              <PLRow label="Production Cost" value={(plData as any)?.expenses?.production_paise} type="debit" />
              <PLRow label="Transport" value={(plData as any)?.expenses?.transport_paise} type="debit" />
              <div style={{ height: 2, backgroundColor: 'var(--bd)', margin: '12px 0 8px' }} />
              <PLRow label="GROSS PROFIT" value={(plData as any)?.gross_profit_paise} type="profit" isTotal />
              <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'right', marginTop: 6 }}>Margin: {(plData as any)?.margin_pct}%</div>
            </div>
          )}
        </div>
      )}

      {/* ── GSTR ─────────────────────────────────────────────────────────────── */}
      {activeTab === 'gstr' && gstr3bData && (
        <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 20, maxWidth: 520 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>GSTR-3B Summary</h3>
            <span style={{ padding: '2px 10px', backgroundColor: 'var(--rustW)', color: 'var(--rust)', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
              {from} → {to}
            </span>
          </div>
          <GSTRow label="3.1(a) Outward taxable" value={(gstr3bData as any)?.['3_1_outward']?.taxable_paise} />
          <GSTRow label="CGST Output" value={(gstr3bData as any)?.['3_1_outward']?.cgst} />
          <GSTRow label="SGST Output" value={(gstr3bData as any)?.['3_1_outward']?.sgst} />
          <GSTRow label="IGST Output" value={(gstr3bData as any)?.['3_1_outward']?.igst} />
          <GSTRow label="ITC CGST (purchases)" value={(gstr3bData as any)?.['4_itc']?.cgst_paise} />
          <GSTRow label="ITC SGST" value={(gstr3bData as any)?.['4_itc']?.sgst_paise} />
          <GSTRow label="Net GST Payable" value={(gstr3bData as any)?.net_payable?.total_paise} highlight />
        </div>
      )}

      {/* ── CASH BOOK ────────────────────────────────────────────────────────── */}
      {activeTab === 'cashbook' && (
        <div>
          {cashBookData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <MetricCard label="Total Receipts" value={formatINR((cashBookData as any)?.summary?.total_receipts_paise || 0)} />
                <MetricCard label="Total Payments" value={formatINR((cashBookData as any)?.summary?.total_payments_paise || 0)} />
                <MetricCard label="Closing Balance" value={formatINR((cashBookData as any)?.summary?.closing_balance_paise || 0)} />
              </div>
              <BookTable entries={(cashBookData as any)?.entries || []} type="cash" />
            </>
          )}
          {!cashBookData && <p style={{ color: 'var(--t3)' }}>No cash transactions found in this period. Post journal vouchers with a Cash account to see entries here.</p>}
        </div>
      )}

      {/* ── BANK BOOK ────────────────────────────────────────────────────────── */}
      {activeTab === 'bankbook' && (
        <div>
          {bankBookData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <MetricCard label="Total Deposits" value={formatINR((bankBookData as any)?.summary?.total_deposits_paise || 0)} />
                <MetricCard label="Total Withdrawals" value={formatINR((bankBookData as any)?.summary?.total_withdrawals_paise || 0)} />
                <MetricCard label="Closing Balance" value={formatINR((bankBookData as any)?.summary?.closing_balance_paise || 0)} />
              </div>
              <BookTable entries={(bankBookData as any)?.entries || []} type="bank" />
            </>
          )}
          {!bankBookData && <p style={{ color: 'var(--t3)' }}>No bank transactions found. Post journal vouchers with a Bank account to see entries here.</p>}
        </div>
      )}

      {/* ── AR/AP AGING ──────────────────────────────────────────────────────── */}
      {activeTab === 'outstanding' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* AR Aging */}
            <div>
              <h3 style={{ marginTop: 0 }}>Accounts Receivable (AR)</h3>
              {arAgingData && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
                    {(arAgingData as any)?.buckets?.map((b: any) => (
                      <div key={b.bucket} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, marginBottom: 4 }}>{b.bucket} days</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{b.count}</div>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}>{formatINR(b.amount_paise)}</div>
                      </div>
                    ))}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
                      {['Invoice', 'Date', 'Customer', 'Amount', 'Age', 'Bucket'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Amount' || h === 'Age' ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(arAgingData as any)?.invoices?.slice(0, 50).map((inv: any) => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{inv.id}</td>
                          <td style={{ padding: '7px 10px' }}>{inv.date}</td>
                          <td style={{ padding: '7px 10px' }}>{inv.customer_name}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatINR(inv.total_paise)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: inv.age_days > 60 ? 'var(--rust)' : 'var(--t2)' }}>{inv.age_days}d</td>
                          <td style={{ padding: '7px 10px' }}><span style={{ padding: '2px 6px', borderRadius: 8, fontSize: 10, backgroundColor: agingColor(inv.aging_bucket), color: 'white' }}>{inv.aging_bucket}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {/* AP Aging */}
            <div>
              <h3 style={{ marginTop: 0 }}>Accounts Payable (AP)</h3>
              {apAgingData && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
                    {(apAgingData as any)?.buckets?.map((b: any) => (
                      <div key={b.bucket} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, marginBottom: 4 }}>{b.bucket} days</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{b.count}</div>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}>{formatINR(b.amount_paise)}</div>
                      </div>
                    ))}
                  </div>
                  {(apAgingData as any)?.msme_overdue_paise > 0 && (
                    <div style={{ backgroundColor: 'var(--amberW)', border: '1px solid var(--amberB)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
                      ⚠ MSME overdue: {formatINR((apAgingData as any)?.msme_overdue_paise)} — Interest may apply under MSMED Act Sec 16
                    </div>
                  )}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
                      {['PO', 'Date', 'Vendor', 'Amount', 'Age', 'MSME'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Amount' || h === 'Age' ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(apAgingData as any)?.purchase_orders?.slice(0, 50).map((po: any) => (
                        <tr key={po.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{po.id}</td>
                          <td style={{ padding: '7px 10px' }}>{po.date}</td>
                          <td style={{ padding: '7px 10px' }}>{po.vendor_name}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatINR(po.total_paise)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: po.age_days > 45 && po.msme_registered ? 'var(--rust)' : 'var(--t2)' }}>{po.age_days}d</td>
                          <td style={{ padding: '7px 10px' }}>
                            {po.msme_registered ? <span style={{ padding: '2px 6px', borderRadius: 8, fontSize: 10, backgroundColor: po.msme_overdue_days > 0 ? 'var(--rust)' : '#e8f5e9', color: po.msme_overdue_days > 0 ? 'white' : '#2e7d32', fontWeight: 600 }}>MSME</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CASH FLOW ────────────────────────────────────────────────────────── */}
      {activeTab === 'cashflow' && cashFlowData && (
        <div style={{ maxWidth: 560 }}>
          <h3 style={{ marginTop: 0 }}>Cash Flow Statement — {(cashFlowData as any)?.period?.from} to {(cashFlowData as any)?.period?.to}</h3>
          <CashFlowSection title="A. Operating Activities" items={[
            { label: 'Collections from customers', value: (cashFlowData as any)?.operating_activities?.collections_paise, positive: true },
            { label: 'Payments to vendors', value: -(cashFlowData as any)?.operating_activities?.vendor_payments_paise, positive: false },
            { label: 'Payroll paid', value: -(cashFlowData as any)?.operating_activities?.payroll_paise, positive: false },
          ]} net={(cashFlowData as any)?.operating_activities?.net_operating_cf_paise} />
          <CashFlowSection title="B. Investing Activities" items={[
            { label: 'Fixed asset purchases', value: -(cashFlowData as any)?.investing_activities?.asset_purchases_paise, positive: false },
            { label: 'Asset disposal proceeds', value: (cashFlowData as any)?.investing_activities?.asset_disposals_paise, positive: true },
          ]} net={(cashFlowData as any)?.investing_activities?.net_investing_cf_paise} />
          <CashFlowSection title="C. Financing Activities" items={[
            { label: 'Loan receipts / Capital (manual entry)', value: 0, positive: true },
          ]} net={0} />
          <div style={{ backgroundColor: 'var(--bg2)', border: '2px solid var(--bd)', borderRadius: 8, padding: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700 }}>
              <span>Net Change in Cash (A+B+C)</span>
              <span style={{ color: (cashFlowData as any)?.net_change_in_cash_paise >= 0 ? '#2e7d32' : 'var(--rust)' }}>
                {formatINR((cashFlowData as any)?.net_change_in_cash_paise)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── BALANCE SHEET ────────────────────────────────────────────────────── */}
      {activeTab === 'balancesheet' && bsData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', textTransform: 'uppercase', fontSize: 12, color: 'var(--t3)' }}>Assets</h4>
              <BSSection title="Fixed Assets" rows={(bsData as any)?.assets?.filter((a: any) => a.group_name?.toLowerCase().includes('fixed') || a.nature === 'asset') || []} />
              <BSSection title="Current Assets" rows={(bsData as any)?.assets?.filter((a: any) => !a.group_name?.toLowerCase().includes('fixed')) || []} />
              <div style={{ borderTop: '2px solid var(--bd)', paddingTop: 10, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                <span>Total Assets</span><span>{formatINR((bsData as any)?.totals?.total_assets_paise || 0)}</span>
              </div>
            </div>
          </div>
          <div>
            <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', textTransform: 'uppercase', fontSize: 12, color: 'var(--t3)' }}>Liabilities & Capital</h4>
              <BSSection title="Capital & Reserves" rows={(bsData as any)?.capital || []} />
              <BSSection title="Liabilities" rows={(bsData as any)?.liabilities || []} />
              <div style={{ padding: '8px 0', borderTop: '1px dashed var(--bd)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--t2)' }}>
                  <span>Net Profit (Current Period)</span>
                  <span style={{ fontWeight: 600 }}>{formatINR((bsData as any)?.totals?.net_profit_paise || 0)}</span>
                </div>
              </div>
              <div style={{ borderTop: '2px solid var(--bd)', paddingTop: 10, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
                <span>Total Liabilities + Capital</span>
                <span>{formatINR((bsData as any)?.totals?.total_liabilities_capital_paise || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RATIO ANALYSIS ───────────────────────────────────────────────────── */}
      {activeTab === 'ratios' && ratioData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <RatioCard title="Liquidity Ratios" items={[
            { label: 'Current Ratio', value: (ratioData as any)?.liquidity?.current_ratio, suffix: ':1', note: '>2 is healthy' },
            { label: 'Quick Ratio', value: (ratioData as any)?.liquidity?.quick_ratio, suffix: ':1', note: '>1 is healthy' },
            { label: 'Working Capital', value: formatINR((ratioData as any)?.liquidity?.current_assets_paise - (ratioData as any)?.liquidity?.current_liabilities_paise), note: '' },
          ]} />
          <RatioCard title="Efficiency Ratios" items={[
            { label: 'Debtors Days', value: (ratioData as any)?.efficiency?.debtors_days, suffix: ' days', note: 'Avg collection period' },
            { label: 'Creditors Days', value: (ratioData as any)?.efficiency?.creditors_days, suffix: ' days', note: 'Avg payment period' },
            { label: 'Inventory Days', value: (ratioData as any)?.efficiency?.inventory_days, suffix: ' days', note: 'Stock holding period' },
          ]} />
          <RatioCard title="Profitability" items={[
            { label: 'Gross Profit Margin', value: `${(ratioData as any)?.profitability?.gross_profit_margin_pct}%`, note: '' },
            { label: 'Revenue', value: formatINR((ratioData as any)?.profitability?.revenue_paise), note: '' },
            { label: 'Gross Profit', value: formatINR((ratioData as any)?.profitability?.gross_profit_paise), note: '' },
          ]} />
          <RatioCard title="Outstanding" items={[
            { label: 'Accounts Receivable', value: formatINR((ratioData as any)?.outstanding?.ar_paise), note: `${(ratioData as any)?.outstanding?.unpaid_invoices} invoices` },
            { label: 'Accounts Payable', value: formatINR((ratioData as any)?.outstanding?.ap_paise), note: '' },
            { label: 'Stock Value', value: formatINR((ratioData as any)?.outstanding?.stock_value_paise), note: '' },
          ]} />
        </div>
      )}

      {/* ── LEDGER ───────────────────────────────────────────────────────────── */}
      {activeTab === 'ledger' && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <label className="fl">Select Account</label>
            <select value={ledgerAccId} onChange={e => setLedgerAccId(e.target.value)} className="fi" style={{ minWidth: 260 }}>
              <option value="">-- Select GL Account --</option>
              {(coaData as any)?.accounts?.map((a: any) => (
                <option key={a.id} value={a.id}>{a.code ? `${a.code} — ` : ''}{a.name}</option>
              ))}
            </select>
          </div>
          {ledgerData && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
                <h3 style={{ margin: 0 }}>Ledger: {(ledgerData as any)?.account?.name}</h3>
                <div style={{ fontSize: 13, color: 'var(--t3)' }}>
                  Dr: {formatINR((ledgerData as any)?.periodDebit)} | Cr: {formatINR((ledgerData as any)?.periodCredit)} | Closing: <strong>{formatINR((ledgerData as any)?.closingBalance)}</strong>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
                  {['Date', 'Voucher', 'Type', 'Narration', 'Debit', 'Credit', 'Balance'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: ['Debit','Credit','Balance'].includes(h) ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(ledgerData as any)?.entries?.map((e: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ padding: '8px 10px' }}>{e.date}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>{e.voucher_id}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--t3)', fontSize: 11, textTransform: 'capitalize' }}>{e.voucher_type}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--t2)', maxWidth: 200 }}>{e.entry_narration || e.narration || '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: e.debit_paise > 0 ? 'var(--t1)' : 'var(--t3)' }}>{e.debit_paise > 0 ? formatINR(e.debit_paise) : '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: e.credit_paise > 0 ? 'var(--t1)' : 'var(--t3)' }}>{e.credit_paise > 0 ? formatINR(e.credit_paise) : '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{formatINR(e.running_balance_paise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(ledgerData as any)?.entries?.length === 0 && <p style={{ color: 'var(--t3)' }}>No journal entries for this account in the selected period.</p>}
            </div>
          )}
        </div>
      )}

      {/* ── STOCK VALUATION ──────────────────────────────────────────────────── */}
      {activeTab === 'stock' && (
        <div>
          {stockData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                <MetricCard label="Total SKUs" value={String((stockData as any)?.summary?.total_skus || 0)} />
                <MetricCard label="Total Value" value={formatINR((stockData as any)?.summary?.total_value_paise || 0)} />
                <MetricCard label="Varieties" value={String((stockData as any)?.by_variety?.length || 0)} />
              </div>
              {((stockData as any)?.by_variety || []).map((grp: any) => (
                <div key={grp.variety} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg3)', padding: '8px 14px', borderRadius: '6px 6px 0 0', borderBottom: '2px solid var(--bd)' }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{grp.variety}</span>
                    <span style={{ fontSize: 12, color: 'var(--t3)' }}>{grp.count} SKUs · {formatINR(grp.total_value_paise)}</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ backgroundColor: 'var(--bg2)' }}>
                      {['SKU / Product', 'Type', 'Stock', 'Unit Cost', 'Value'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: ['Unit Cost','Value','Stock'].includes(h) ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {grp.products.map((p: any) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{p.id}<br /><span style={{ fontSize: 10, color: 'var(--t3)' }}>{p.name || ''}</span></td>
                          <td style={{ padding: '7px 10px', textTransform: 'capitalize', color: 'var(--t3)', fontSize: 11 }}>{p.type}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>{p.stock_qty}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatINR(p.cost_paise)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{formatINR(p.value_paise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {!(stockData as any)?.by_variety?.length && <p style={{ color: 'var(--t3)' }}>No stock items found.</p>}
            </>
          )}
        </div>
      )}

      {/* ── DEPRECIATION ─────────────────────────────────────────────────────── */}
      {activeTab === 'depreciation' && (
        <div>
          {depData && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                <MetricCard label="Total Assets" value={String((depData as any)?.summary?.total_assets || 0)} />
                <MetricCard label="Gross Block" value={formatINR((depData as any)?.summary?.gross_block_paise || 0)} />
                <MetricCard label="Accumulated Dep." value={formatINR((depData as any)?.summary?.total_accumulated_dep_paise || 0)} />
                <MetricCard label="Net Block" value={formatINR((depData as any)?.summary?.net_block_paise || 0)} />
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
                  {['Asset', 'Category', 'Purchase Date', 'Cost', 'Rate', 'Monthly Dep.', 'Accumulated', 'Book Value', 'Status'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: ['Cost','Monthly Dep.','Accumulated','Book Value'].includes(h) ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {((depData as any)?.assets || []).map((a: any) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--bd)', opacity: a.fully_depreciated ? 0.6 : 1 }}>
                      <td style={{ padding: '7px 10px' }}><div style={{ fontWeight: 600 }}>{a.name}</div><div style={{ fontSize: 10, color: 'var(--t3)' }}>{a.id}</div></td>
                      <td style={{ padding: '7px 10px', color: 'var(--t3)', fontSize: 11 }}>{a.category}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--t3)', fontSize: 11 }}>{a.purchase_date}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatINR(a.cost_paise)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--t3)' }}>{a.depreciation_rate}%</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatINR(a.monthly_dep_paise)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--rust)' }}>{formatINR(a.accumulated_dep_paise)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{formatINR(a.book_value_paise)}</td>
                      <td style={{ padding: '7px 10px' }}>
                        {a.fully_depreciated
                          ? <span style={{ padding: '2px 6px', borderRadius: 8, fontSize: 10, backgroundColor: 'var(--bg3)', color: 'var(--t3)', fontWeight: 600 }}>Fully Dep.</span>
                          : <span style={{ padding: '2px 6px', borderRadius: 8, fontSize: 10, backgroundColor: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }}>Active</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(depData as any)?.assets?.length && <p style={{ color: 'var(--t3)' }}>No fixed assets found.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>{value}</div>
    </div>
  );
}

function StatusBadge({ paid }: { paid: boolean }) {
  return (
    <span style={{ padding: '2px 8px', backgroundColor: 'var(--bg3)', color: 'var(--t2)', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
      {paid ? 'Paid' : 'Pending'}
    </span>
  );
}

function PLRow({ label, value, type, isTotal }: { label: string; value?: number; type?: string; isTotal?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: `${isTotal ? 12 : 8}px 0`, borderBottom: !isTotal ? '1px solid var(--bd)' : 'none', borderTop: isTotal ? '2px solid var(--bd)' : 'none', fontSize: type === 'profit' ? 15 : 13, fontWeight: isTotal ? 700 : 400 }}>
      <span style={{ color: type === 'header' ? 'var(--t3)' : 'var(--t2)' }}>{label}</span>
      {value !== undefined && <span style={{ color: 'var(--t1)' }}>{formatINR(value)}</span>}
    </div>
  );
}

function PLSection({ title, items }: { title: string; items: any[] }) {
  const total = items.reduce((s: number, r: any) => s + Math.abs(r.closing_balance || 0), 0);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>
      {items.map((r: any) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--bd)' }}>
          <span style={{ color: 'var(--t2)' }}>{r.name}</span>
          <span>{formatINR(Math.abs(r.closing_balance || 0))}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, fontWeight: 700 }}>
        <span>{title} Total</span><span>{formatINR(total)}</span>
      </div>
    </div>
  );
}

function GSTRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: highlight ? '12px 0 8px' : '8px 0', borderBottom: !highlight ? '1px solid var(--bd)' : 'none', borderTop: highlight ? '2px solid var(--bd)' : 'none' }}>
      <span style={{ fontSize: highlight ? 13 : 12, color: highlight ? 'var(--t1)' : 'var(--t2)', fontFamily: "'IBM Plex Mono', monospace" }}>{label}</span>
      <span style={{ fontSize: highlight ? 15 : 13, fontWeight: highlight ? 700 : 400, color: 'var(--t1)', fontFamily: "'IBM Plex Mono', monospace" }}>{formatINR(value || 0)}</span>
    </div>
  );
}

function BookTable({ entries, type }: { entries: any[]; type: 'cash' | 'bank' }) {
  if (entries.length === 0) return <p style={{ color: 'var(--t3)' }}>No entries found.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
        {['Date', 'Voucher', 'Narration', 'Contra A/c', type === 'cash' ? 'Receipts' : 'Deposits', type === 'cash' ? 'Payments' : 'Withdrawals', 'Balance'].map(h => (
          <th key={h} style={{ padding: '8px 10px', textAlign: ['Receipts','Deposits','Payments','Withdrawals','Balance'].includes(h) ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
        ))}
      </tr></thead>
      <tbody>
        {entries.map((e: any, i: number) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--bd)', backgroundColor: e.inflow_paise > 0 ? 'rgba(46,125,50,0.03)' : 'rgba(198,40,40,0.03)' }}>
            <td style={{ padding: '7px 10px' }}>{e.date}</td>
            <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{e.voucher_id}</td>
            <td style={{ padding: '7px 10px', color: 'var(--t2)', maxWidth: 160 }}>{e.narration || '—'}</td>
            <td style={{ padding: '7px 10px', color: 'var(--t3)', fontSize: 11 }}>{e.contra_accounts || '—'}</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--sage)' }}>{e.inflow_paise > 0 ? formatINR(e.inflow_paise) : '—'}</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--rust)' }}>{e.outflow_paise > 0 ? formatINR(e.outflow_paise) : '—'}</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{formatINR(e.running_balance_paise)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CashFlowSection({ title, items, net }: { title: string; items: { label: string; value: number; positive: boolean }[]; net: number }) {
  return (
    <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>{title}</div>
      {items.map(item => (
        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--bd)', fontSize: 12 }}>
          <span style={{ color: 'var(--t2)' }}>{item.label}</span>
          <span style={{ color: item.value >= 0 ? 'var(--t1)' : 'var(--rust)' }}>{formatINR(item.value)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontWeight: 700, fontSize: 13 }}>
        <span>Net Cash {title.includes('Operating') ? 'from Ops' : title.includes('Investing') ? 'from Investing' : 'from Financing'}</span>
        <span style={{ color: net >= 0 ? '#2e7d32' : 'var(--rust)' }}>{formatINR(net)}</span>
      </div>
    </div>
  );
}

function BSSection({ title, rows }: { title: string; rows: any[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>
      {rows.map((r: any) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--bd)' }}>
          <span style={{ color: 'var(--t2)' }}>{r.code ? `${r.code} ` : ''}{r.name}</span>
          <span>{formatINR(Math.abs(r.closing_balance || 0))}</span>
        </div>
      ))}
    </div>
  );
}

function RatioCard({ title, items }: { title: string; items: { label: string; value: any; suffix?: string; note: string }[] }) {
  return (
    <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{title}</div>
      {items.map(item => (
        <div key={item.label} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>{item.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{item.value}{item.suffix || ''}</div>
          {item.note && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{item.note}</div>}
        </div>
      ))}
    </div>
  );
}

function agingColor(bucket: string): string {
  switch (bucket) {
    case '0-30':  return '#4caf50';
    case '31-60': return '#ff9800';
    case '61-90': return '#f44336';
    case '91-120': return '#b71c1c';
    default:      return '#880e4f';
  }
}
