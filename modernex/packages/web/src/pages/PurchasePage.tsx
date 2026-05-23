import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColDef } from 'ag-grid-community';
import { GST_RATE, GST_RATE_LABEL, VARIETIES } from '@modernex/shared';
import { usePurchaseOrders, useVendors, useCreatePurchaseOrder, useCreatePayment } from '@/hooks/useApi';
import { DataGridTable } from '@/components/DataGridTable';
import { formatINR, numericInputValue, selectOnFocus } from '@/utils/format';
import { useToastStore } from '@/store';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  received:  { bg: 'var(--bg3)', color: 'var(--t2)' },
  cancelled: { bg: 'var(--bg3)', color: 'var(--t2)' },
  approved:  { bg: 'var(--bg3)', color: 'var(--t2)' },
  new:       { bg: 'var(--bg3)', color: 'var(--t2)' },
};


export function PurchasePage() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: posData, isLoading } = usePurchaseOrders({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });
  const { data: vendorsData } = useVendors({});
  const createPO = useCreatePurchaseOrder();
  const createPayment = useCreatePayment();
  const { notify } = useToastStore();

  const [payingPo, setPayingPo] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<'full' | 'custom'>('full');
  const [payCustom, setPayCustom] = useState('');
  const [payMode, setPayMode] = useState('NEFT');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payUtr, setPayUtr] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const pos: any[] = posData?.purchase_orders || [];
  const vendors: any[] = vendorsData?.vendors || [];

  const [form, setForm] = useState({
    vendor_id: '',
    variety: '',
    blocks: 1,
    cft: 0,
    rate_per_cft_paise: 0,
    transport_paise: 0,
    notes: '',
    date: new Date().toISOString().slice(0, 10),
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createPO.mutateAsync(form);
      notify('Purchase order created successfully', 'success');
      setShowCreate(false);
      setForm({ vendor_id: '', variety: '', blocks: 1, cft: 0, rate_per_cft_paise: 0, transport_paise: 0, notes: '', date: new Date().toISOString().slice(0, 10) });
    } catch (err: any) {
      notify(err.message || 'Failed to create purchase order', 'error');
    }
  };

  const openPay = useCallback((po: any) => {
    setPayingPo(po);
    setPayAmount('full');
    setPayCustom('');
    setPayMode('NEFT');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayUtr('');
    setPayNotes('');
  }, []);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingPo) return;
    const balance = payingPo.balance_paise ?? (payingPo.total_paise - (payingPo.paid_paise ?? 0));
    const amount_paise = payAmount === 'full' ? balance : Math.round((parseFloat(payCustom) || 0) * 100);
    if (amount_paise <= 0) { notify('Enter a valid amount', 'error'); return; }
    try {
      await createPayment.mutateAsync({
        po_id: payingPo.id,
        type: 'payment',
        amount_paise,
        mode: payMode,
        utr: payUtr || undefined,
        date: payDate,
        notes: payNotes || undefined,
        party: payingPo.vendor_name || payingPo.vendor_id,
      });
      notify('Payment recorded', 'success');
      setPayingPo(null);
    } catch (err: any) {
      notify(err.message || 'Failed to record payment', 'error');
    }
  };

  const totals = (() => {
    const taxable = Math.round(form.cft * form.rate_per_cft_paise) + (form.transport_paise || 0);
    const gst = Math.round(taxable * GST_RATE);
    return { taxable, gst, total: taxable + gst };
  })();

  const colDefs = useMemo<ColDef[]>(() => [
    { headerName: 'ID', field: 'id', minWidth: 140, pinned: 'left' },
    {
      headerName: 'Date',
      field: 'date',
      minWidth: 120,
      valueFormatter: (p) => p.value ? new Date(p.value).toLocaleDateString() : '—',
    },
    { headerName: 'Vendor', field: 'vendor_name', minWidth: 160, flex: 1, valueFormatter: (p) => p.value || p.data?.vendor_id || '—' },
    { headerName: 'Variety', field: 'variety', minWidth: 160, flex: 1 },
    { headerName: 'Blocks', field: 'blocks', minWidth: 90, type: 'numericColumn' },
    {
      headerName: 'CFT / CBM', field: 'cft', minWidth: 130,
      valueFormatter: (p) => p.value ? `${p.value} / ${(p.value * 0.0283168).toFixed(3)}` : '—',
    },
    {
      headerName: 'Total',
      field: 'total_paise',
      minWidth: 120,
      type: 'numericColumn',
      valueFormatter: (p) => formatINR(p.value),
    },
    {
      headerName: 'Paid',
      field: 'paid_paise',
      minWidth: 110,
      type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? formatINR(p.value) : '—',
    },
    {
      headerName: 'Balance',
      field: 'balance_paise',
      minWidth: 120,
      type: 'numericColumn',
      cellRenderer: (p: any) => {
        const val = p.value ?? (p.data?.total_paise - (p.data?.paid_paise ?? 0));
        const color = val > 0 ? '#b91c1c' : '#15803d';
        return <span style={{ fontWeight: 600, color }}>{formatINR(val)}</span>;
      },
    },
    {
      headerName: 'Status',
      field: 'status',
      minWidth: 120,
      cellRenderer: (p: any) => {
        const s = STATUS_COLORS[p.value] ?? STATUS_COLORS.new!;
        return (
          <span style={{ padding: '2px 8px', backgroundColor: s!.bg, color: s!.color, borderRadius: 10, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
            {p.value}
          </span>
        );
      },
    },
    {
      headerName: 'Due / Paid',
      colId: 'pay_action',
      minWidth: 140,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (p: any) => {
        const status = p.data?.payment_status;
        const balance = p.data?.balance_paise ?? (p.data?.total_paise - (p.data?.paid_paise ?? 0));
        if (status === 'paid') {
          return (
            <span style={{ padding: '2px 10px', background: 'var(--sageW)', color: 'var(--sage)', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
              ✓ Paid
            </span>
          );
        }
        const isPartial = status === 'partial';
        return (
          <button
            onClick={() => openPay(p.data)}
            style={{
              padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', fontWeight: 600,
              border: `1px solid ${isPartial ? 'var(--amber)' : 'var(--red)'}`,
              background: isPartial ? 'var(--amberW)' : 'var(--redW)',
              color: isPartial ? 'var(--amber)' : 'var(--red)',
            }}
          >
            {isPartial ? 'Partial' : 'Unpaid'} — Due {formatINR(balance)}
          </button>
        );
      },
    },
    {
      headerName: '',
      colId: 'view_action',
      width: 80,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (p: any) => (
        <button
          onClick={() => navigate(`/purchase/${encodeURIComponent(p.data?.id)}`)}
          style={{ padding: '3px 10px', fontSize: 11, border: '1px solid var(--bd)', borderRadius: 3, cursor: 'pointer', background: 'var(--bg2)', color: 'var(--t1)', fontWeight: 600 }}
        >
          View
        </button>
      ),
    },
  ], [navigate, openPay]);

  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ marginBottom: '8px' }}>Purchase Orders</h1>
        <p style={{ color: 'var(--t3)', fontSize: '13px', marginBottom: '0' }}>
          Manage raw material and block purchases
        </p>
      </div>

      {/* Filters and Actions */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['all', 'new', 'approved', 'received', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: '8px 16px', borderRadius: '4px', border: '1px solid var(--bd)',
                backgroundColor: statusFilter === status ? 'var(--rust)' : 'transparent',
                color: statusFilter === status ? 'white' : 'var(--t2)',
                cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                textTransform: 'capitalize', transition: 'all 0.2s',
              }}
            >
              {status === 'all' ? `All (${pos.length})` : status}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{ padding: '10px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}
        >
          {showCreate ? 'Cancel' : '+ New PO'}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Create Purchase Order</h3>
          <form onSubmit={handleCreate}>
            <div className="fg2" style={{ gap: '16px', marginBottom: '16px' }}>
              <div>
                <label className="fl">Date *</label>
                <input type="date" className="fi" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div>
                <label className="fl">Vendor *</label>
                <select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} required className="fsel">
                  <option value="">Select vendor...</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.id})</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Variety *</label>
                <select
                  className="fi"
                  value={VARIETIES.includes(form.variety) ? form.variety : form.variety ? '__custom__' : ''}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') return;
                    setForm({ ...form, variety: e.target.value });
                  }}
                  required={!form.variety}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">— select variety —</option>
                  {VARIETIES.map((v: string) => <option key={v} value={v}>{v}</option>)}
                  {form.variety && !VARIETIES.includes(form.variety) && (
                    <option value="__custom__">{form.variety} (custom)</option>
                  )}
                </select>
                {/* allow typing a custom variety not in the list */}
                <input
                  type="text"
                  className="fi"
                  style={{ marginTop: 4, fontSize: 11 }}
                  placeholder="Or type custom variety name…"
                  value={!VARIETIES.includes(form.variety) ? form.variety : ''}
                  onChange={(e) => setForm({ ...form, variety: e.target.value })}
                />
              </div>
              <div>
                <label className="fl">Blocks *</label>
                <input type="number" value={numericInputValue(form.blocks, false)} onChange={(e) => setForm({ ...form, blocks: parseInt(e.target.value) || 1 })} onFocus={selectOnFocus} required min="1" className="fi" />
              </div>
              <div>
                <label className="fl">CFT *</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" value={numericInputValue(form.cft)} onChange={(e) => setForm({ ...form, cft: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} required min="0" step="0.01" className="fi" style={{ flex: 1 }} />
                  <div style={{ minWidth: 100, fontSize: 12, color: 'var(--gold)', fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>
                    = {(form.cft * 0.0283168).toFixed(3)} CBM
                  </div>
                </div>
              </div>
              <div>
                <label className="fl">Rate per CFT (₹) *</label>
                <input type="number" value={numericInputValue(form.rate_per_cft_paise / 100)} onChange={(e) => setForm({ ...form, rate_per_cft_paise: Math.round((parseFloat(e.target.value) || 0) * 100) })} onFocus={selectOnFocus} required min="0" step="0.01" className="fi" />
              </div>
              <div>
                <label className="fl">Transport (₹)</label>
                <input type="number" value={numericInputValue(form.transport_paise / 100)} onChange={(e) => setForm({ ...form, transport_paise: Math.round((parseFloat(e.target.value) || 0) * 100) })} onFocus={selectOnFocus} min="0" step="0.01" className="fi" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="fl">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="fi" />
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg3)', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', display: 'flex', gap: '24px', fontSize: '13px', flexWrap: 'wrap' }}>
              <div><span style={{ color: 'var(--t3)' }}>Taxable:</span> <strong>{formatINR(totals.taxable)}</strong></div>
              <div><span style={{ color: 'var(--t3)' }}>GST ({GST_RATE_LABEL}%):</span> <strong>{formatINR(totals.gst)}</strong></div>
              <div><span style={{ color: 'var(--t3)' }}>Total:</span> <strong style={{ color: 'var(--rust)', fontSize: '15px' }}>{formatINR(totals.total)}</strong></div>
            </div>

            <button type="submit" disabled={createPO.isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: '4px', cursor: createPO.isPending ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
              {createPO.isPending ? 'Creating...' : 'Create Purchase Order'}
            </button>
          </form>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--t3)' }}>Loading purchase orders...</p>
      ) : (
        <DataGridTable
          rowData={pos}
          columnDefs={colDefs}
          getRowId={(p) => p.data.id}
          emptyMessage="No purchase orders found."
          height={480}
        />
      )}

      {/* Record Payment Modal */}
      {payingPo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setPayingPo(null); }}>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: 28, width: 400, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 4px' }}>Record Payment</h3>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
              {payingPo.id} — {payingPo.vendor_name || payingPo.vendor_id}
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: 'var(--t3)' }}>Total:</span> <strong>{formatINR(payingPo.total_paise)}</strong></div>
              <div><span style={{ color: 'var(--t3)' }}>Paid:</span> <strong>{formatINR(payingPo.paid_paise ?? 0)}</strong></div>
              <div><span style={{ color: 'var(--t3)' }}>Balance:</span> <strong style={{ color: 'var(--red)' }}>{formatINR(payingPo.balance_paise ?? (payingPo.total_paise - (payingPo.paid_paise ?? 0)))}</strong></div>
            </div>
            <form onSubmit={handlePayment}>
              <div style={{ marginBottom: 14 }}>
                <label className="fl">Amount (₹) *</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  {(['full', 'custom'] as const).map((opt) => (
                    <button key={opt} type="button" onClick={() => setPayAmount(opt)}
                      style={{ padding: '5px 14px', borderRadius: 4, border: '1px solid var(--bd)', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                        background: payAmount === opt ? 'var(--rust)' : 'transparent',
                        color: payAmount === opt ? 'white' : 'var(--t2)' }}>
                      {opt === 'full' ? `Full — ${formatINR(payingPo.balance_paise ?? (payingPo.total_paise - (payingPo.paid_paise ?? 0)))}` : 'Custom'}
                    </button>
                  ))}
                </div>
                {payAmount === 'custom' && (
                  <input type="number" className="fi" min="0.01" step="0.01" required
                    value={payCustom} onChange={(e) => setPayCustom(e.target.value)}
                    placeholder="Enter amount in ₹" onFocus={selectOnFocus} />
                )}
              </div>
              <div className="fg2" style={{ marginBottom: 14 }}>
                <div>
                  <label className="fl">Mode *</label>
                  <select className="fsel" value={payMode} onChange={(e) => setPayMode(e.target.value)} required>
                    {['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash', 'Other'].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="fl">Date *</label>
                  <input type="date" className="fi" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="fl">UTR / Reference</label>
                  <input type="text" className="fi" value={payUtr} onChange={(e) => setPayUtr(e.target.value)} placeholder="Transaction reference (optional)" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="fl">Notes</label>
                  <input type="text" className="fi" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setPayingPo(null)}
                  style={{ padding: '8px 18px', border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer', background: 'transparent', color: 'var(--t2)', fontWeight: 600 }}>
                  Cancel
                </button>
                <button type="submit" disabled={createPayment.isPending}
                  style={{ padding: '8px 20px', background: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: createPayment.isPending ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                  {createPayment.isPending ? 'Saving…' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
