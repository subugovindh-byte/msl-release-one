import { useState } from 'react';
import {
  useConsumablePurchases, useCreateConsumablePurchase,
  useUpdateConsumablePurchase, useCancelConsumablePurchase, useCreatePayment,
  useVendors,
  type ConsumablePurchase, type CPItem,
} from '@/hooks/useApi';
import { useToastStore } from '@/store';
import { PageHeader, ConfirmDialog, StatCard, ReceiptAttach } from '@/components/Shared';
import { DataGridTable } from '@/components/DataGridTable';
import { formatINR, selectOnFocus } from '@/utils/format';
import { statusTone } from '@/styles/ui';

const CATEGORIES = ['Consumables', 'Machinery Parts', 'Tools & Equipment', 'Safety & PPE', 'Office & Admin', 'Other'];
const UNITS = ['Nos', 'Pcs', 'Set', 'Kg', 'Ltr', 'Mtr', 'Roll', 'Box', 'Pair'];
const PAYMENT_MODES = ['Cash', 'Cheque', 'NEFT', 'RTGS', 'UPI'];

const BLANK_ITEM: CPItem = { description: '', qty: 1, unit: 'Nos', rate_paise: 0, amount_paise: 0 };

function today() { return new Date().toISOString().slice(0, 10); }

export function ConsumablesPage() {
  const { notify } = useToastStore();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { data, isLoading } = useConsumablePurchases(filters);
  const create  = useCreateConsumablePurchase();
  const update  = useUpdateConsumablePurchase();
  const cancel  = useCancelConsumablePurchase();

  const purchases: ConsumablePurchase[] = (data as any)?.purchases ?? [];

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ConsumablePurchase | null>(null);
  const [toCancel, setToCancel] = useState<ConsumablePurchase | null>(null);
  const [payingCP, setPayingCP] = useState<ConsumablePurchase | null>(null);
  const [payAmount, setPayAmount] = useState<'full' | 'custom'>('full');
  const [payCustom, setPayCustom] = useState('');
  const [payMode, setPayMode] = useState('NEFT');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payUtr, setPayUtr] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payApplyAdvance, setPayApplyAdvance] = useState(false);
  const [cancelAdvanceCP, setCancelAdvanceCP] = useState<ConsumablePurchase | null>(null);
  const createPayment = useCreatePayment();
  const { data: vendorsData } = useVendors({});
  const vendors: any[] = (vendorsData as any)?.vendors ?? [];

  // ── form state ──
  const blank = { date: today(), vendor_name: '', vendor_id: '', category: 'Consumables', payment_mode: '', reference_no: '', notes: '', receipt_url: '' };
  const [form, setForm] = useState({ ...blank });
  const [items, setItems] = useState<CPItem[]>([{ ...BLANK_ITEM }]);
  function openCreate() {
    setEditing(null);
    setForm({ ...blank });
    setItems([{ ...BLANK_ITEM }]);
    setShowForm(true);
  }

  function openEdit(p: ConsumablePurchase) {
    setEditing(p);
    setForm({ date: p.date, vendor_name: p.vendor_name, vendor_id: p.vendor_id ?? '', category: p.category, payment_mode: p.payment_mode ?? '', reference_no: p.reference_no ?? '', notes: p.notes ?? '', receipt_url: p.receipt_url ?? '' });
    setItems(p.items.length ? p.items : [{ ...BLANK_ITEM }]);
    setShowForm(true);
  }

  function setItem(i: number, k: keyof CPItem, v: string | number) {
    setItems(prev => prev.map((it, idx) => {
      if (idx !== i) return it;
      const updated = { ...it, [k]: v };
      updated.amount_paise = Math.round(updated.qty * updated.rate_paise);
      return updated;
    }));
  }

  function addItem() { setItems(prev => [...prev, { ...BLANK_ITEM }]); }
  function removeItem(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)); }

  const totalPaise = items.reduce((s, it) => s + (it.amount_paise || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vendor_name) { notify('Vendor name required', 'error'); return; }
    if (items.every(it => !it.description)) { notify('Add at least one item', 'error'); return; }
    const validItems = items.filter(it => it.description.trim());
    try {
      const payload = { ...form, items: validItems, total_paise: totalPaise } as any;
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        notify('Purchase updated', 'success');
      } else {
        await create.mutateAsync(payload);
        notify('Purchase recorded', 'success');
      }
      setShowForm(false);
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  }

  function openPayModal(cp: ConsumablePurchase) {
    setPayingCP(cp);
    setPayAmount('full');
    setPayCustom('');
    setPayMode('NEFT');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayUtr('');
    setPayNotes('');
    setPayApplyAdvance(false);
  }

  async function handlePaySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payingCP) return;
    const balance = payingCP.balance_paise ?? (payingCP.total_paise - (payingCP.paid_paise ?? 0));
    const vendor = vendors.find((v: any) => v.id === payingCP.vendor_id);
    const vendorAdvance = vendor?.advance_paise ?? 0;
    const advanceToApply = payApplyAdvance ? Math.min(vendorAdvance, balance) : 0;
    let cashAmount: number;
    if (payAmount === 'full') {
      cashAmount = Math.max(0, balance - advanceToApply);
    } else {
      cashAmount = Math.round((parseFloat(payCustom) || 0) * 100);
    }
    const totalCredit = cashAmount + advanceToApply;
    if (totalCredit <= 0) { notify('Enter a valid amount', 'error'); return; }
    const payloadAmount = cashAmount > 0 ? cashAmount : advanceToApply;
    try {
      await createPayment.mutateAsync({
        cp_id: payingCP.id, type: 'payment',
        amount_paise: payloadAmount, mode: cashAmount > 0 ? payMode : 'Other',
        utr: payUtr || undefined, date: payDate,
        notes: payNotes || (advanceToApply > 0 ? `Advance adjusted: ${formatINR(advanceToApply)}` : undefined),
        party: payingCP.vendor_name,
        apply_advance_paise: advanceToApply > 0 ? advanceToApply : undefined,
      });
      notify(`Payment recorded${advanceToApply > 0 ? ` (${formatINR(advanceToApply)} advance applied)` : ''}`, 'success');
      setPayingCP(null);
    } catch (err: any) { notify(err.message || 'Failed to record payment', 'error'); }
  }

  // ── summary stats ──
  const active = purchases.filter(p => p.status !== 'cancelled');
  const totalSpend = active.reduce((s, p) => s + p.total_paise, 0);
  const pendingSpend = active.filter(p => p.payment_status !== 'paid')
    .reduce((s, p) => s + (p.balance_paise ?? p.total_paise), 0);
  const partialCount = active.filter(p => p.payment_status === 'partial').length;
  const paidCount = active.filter(p => p.payment_status === 'paid').length;

  // ── AG Grid columns ──
  const colDefs: any[] = [
    { headerName: 'ID', field: 'id', minWidth: 140, pinned: 'left' },
    { headerName: 'Date', field: 'date', minWidth: 110, valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—' },
    { headerName: 'Vendor', field: 'vendor_name', minWidth: 160, flex: 1 },
    { headerName: 'Category', field: 'category', minWidth: 150 },
    {
      headerName: 'Items', minWidth: 80,
      valueGetter: (p: any) => (p.data.items?.length ?? 0),
    },
    {
      headerName: 'Total', field: 'total_paise', minWidth: 120, type: 'numericColumn',
      valueFormatter: (p: any) => formatINR(p.value),
    },
    {
      headerName: 'Paid', field: 'paid_paise', minWidth: 110, type: 'numericColumn',
      valueFormatter: (p: any) => p.value != null ? formatINR(p.value) : '—',
    },
    {
      headerName: 'Balance', field: 'balance_paise', minWidth: 110, type: 'numericColumn',
      cellRenderer: (p: any) => {
        if (p.value == null || p.value <= 0) return '<span style="color:var(--sage);font-weight:700">Nil</span>';
        return `<span style="color:var(--red);font-weight:700">${formatINR(p.value)}</span>`;
      },
    },
    {
      headerName: 'Status', field: 'payment_status', minWidth: 110,
      cellRenderer: (p: any) => {
        const st = p.value ?? p.data?.status ?? 'pending';
        const { color, bg } = statusTone(st);
        return `<span style="padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${bg};color:${color};text-transform:capitalize">${st}</span>`;
      },
    },
    { headerName: 'Mode', field: 'payment_mode', minWidth: 90 },
    { headerName: 'Created By', field: 'created_by', minWidth: 110 },
    {
      headerName: 'Receipt', field: 'receipt_url', minWidth: 80,
      cellRenderer: (p: any) => p.value
        ? `<a href="${p.value}" target="_blank" style="color:var(--rust);text-decoration:underline;font-size:11px">View</a>`
        : '<span style="color:var(--t3);font-size:11px">—</span>',
    },
    {
      headerName: 'Actions', minWidth: 220, sortable: false, filter: false,
      cellRenderer: (p: any) => {
        const d = p.data as ConsumablePurchase;
        if (d.status === 'cancelled') return '<span style="color:var(--t3);font-size:11px">Cancelled</span>';
        const canPay = d.payment_status !== 'paid';
        return `
          <div style="display:flex;gap:6px;align-items:center;height:100%">
            <button class="btn-edit" data-id="${d.id}" style="padding:3px 10px;font-size:11px;font-weight:600;border:none;border-radius:4px;cursor:pointer;background:var(--blue);color:#fff">Edit</button>
            ${canPay ? `<button class="btn-pay" data-id="${d.id}" style="padding:3px 10px;font-size:11px;font-weight:600;border:none;border-radius:4px;cursor:pointer;background:var(--rust);color:#fff">₹ Pay</button>` : ''}
            <button class="btn-cancel" data-id="${d.id}" style="padding:3px 10px;font-size:11px;font-weight:600;border:1px solid var(--red);border-radius:4px;cursor:pointer;background:transparent;color:var(--red)">Cancel</button>
          </div>`;
      },
      onCellClicked: (p: any) => {
        const btn = (p.event?.target as HTMLElement)?.closest('button');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const row = purchases.find(x => x.id === id);
        if (!row) return;
        if (btn.classList.contains('btn-edit')) openEdit(row);
        if (btn.classList.contains('btn-pay')) openPayModal(row);
        if (btn.classList.contains('btn-cancel')) {
          if ((row.paid_paise ?? 0) > 0) {
            setCancelAdvanceCP(row);
          } else {
            setToCancel(row);
          }
        }
      },
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Operational Purchases"
        subtitle="Consumables, machinery parts, tools and other operational expenses"
        action={<button className="btn btn-p" onClick={openCreate}>+ New Purchase</button>}
      />

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Spend" value={formatINR(totalSpend)} sub={`${active.length} purchases`} />
        <StatCard label="Outstanding Due" value={formatINR(pendingSpend)} sub="unpaid + partial" valueColor="var(--gold)" />
        <StatCard label="Partial Payments" value={String(partialCount)} sub="in progress" valueColor="var(--amber)" />
        <StatCard label="Fully Paid" value={String(paidCount)} sub="completed" valueColor="var(--sage)" />
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="fi" style={{ width: 'auto' }} value={filters.status ?? 'all'} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="fi" style={{ width: 'auto' }} value={filters.category ?? 'all'} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <input className="fi" type="date" style={{ width: 'auto' }} value={filters.from ?? ''} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} placeholder="From" />
        <input className="fi" type="date" style={{ width: 'auto' }} value={filters.to ?? ''} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} placeholder="To" />
        <input className="fi" style={{ width: 200 }} value={filters.search ?? ''} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} placeholder="Search vendor / ID…" />
      </div>

      {/* ── Create / Edit Form ── */}
      {showForm && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 24, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 18 }}>
            {editing ? `Edit — ${editing.id}` : 'New Operational Purchase'}
          </div>
          <form onSubmit={handleSubmit}>
            {/* Header fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14, marginBottom: 20 }}>
              <div>
                <label className="fl">Date *</label>
                <input className="fi" type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="fl">Vendor / Supplier *</label>
                <select className="fi" value={form.vendor_id || '__custom__'}
                  onChange={e => {
                    if (e.target.value === '__custom__') {
                      setForm(f => ({ ...f, vendor_id: '', vendor_name: '' }));
                    } else {
                      const v = vendors.find((v: any) => v.id === e.target.value);
                      setForm(f => ({ ...f, vendor_id: v?.id ?? '', vendor_name: v?.name ?? '' }));
                    }
                  }}>
                  <option value="__custom__">— type below (not in master) —</option>
                  {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                {!form.vendor_id && (
                  <input className="fi" type="text" required value={form.vendor_name}
                    onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                    placeholder="Supplier name" style={{ marginTop: 4 }} />
                )}
              </div>
              <div>
                <label className="fl">Category *</label>
                <select className="fi" required value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Payment Mode</label>
                <select className="fi" value={form.payment_mode} onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}>
                  <option value="">— select —</option>
                  {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Reference / Bill No.</label>
                <input className="fi" type="text" value={form.reference_no} onChange={e => setForm(f => ({ ...f, reference_no: e.target.value }))} placeholder="Invoice / receipt number" />
              </div>
              <div>
                <label className="fl">Notes</label>
                <input className="fi" type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any remarks…" />
              </div>
            </div>

            {/* Receipt upload */}
            <div style={{ marginBottom: 20 }}>
              <label className="fl" style={{ marginBottom: 8, display: 'block' }}>Receipt / Bill Photo</label>
              <ReceiptAttach
                value={form.receipt_url || undefined}
                onChange={dataUri => setForm(f => ({ ...f, receipt_url: dataUri }))}
                onClear={() => setForm(f => ({ ...f, receipt_url: '' }))}
              />
            </div>

            {/* Line items */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                Line Items
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Header row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 110px 110px 32px', gap: 6, fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 4px' }}>
                  <span>Description</span><span>Qty</span><span>Unit</span><span>Rate (₹)</span><span>Amount (₹)</span><span></span>
                </div>
                {items.map((it, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 110px 110px 32px', gap: 6, alignItems: 'center' }}>
                    <input className="fi" type="text" value={it.description} onChange={e => setItem(i, 'description', e.target.value)} placeholder="Item description" />
                    <input className="fi" type="number" min="0" step="0.001" value={it.qty || ''} onChange={e => setItem(i, 'qty', parseFloat(e.target.value) || 0)} />
                    <select className="fi" value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)}>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                    <input className="fi" type="number" min="0" step="0.01" value={it.rate_paise ? it.rate_paise / 100 : ''} onChange={e => setItem(i, 'rate_paise', Math.round((parseFloat(e.target.value) || 0) * 100))} placeholder="0.00" />
                    <div style={{ padding: '0 8px', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                      {formatINR(it.amount_paise)}
                    </div>
                    <button type="button" title="Remove item" onClick={() => removeItem(i)} disabled={items.length === 1}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 16, fontWeight: 700, padding: 0 }}>×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addItem}
                style={{ marginTop: 10, padding: '5px 14px', border: '1px dashed var(--bd)', borderRadius: 5, background: 'none', color: 'var(--rust)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                + Add Item
              </button>
            </div>

            {/* Total */}
            <div style={{ background: 'var(--bg3)', borderRadius: 6, padding: '10px 16px', marginBottom: 18, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--t3)', fontSize: 13 }}>Total:</span>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--rust)' }}>{formatINR(totalPaise)}</span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-p" disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) ? 'Saving…' : editing ? 'Save Changes' : 'Record Purchase'}
              </button>
              <button type="button" className="btn" style={{ background: 'var(--bg3)', border: '1px solid var(--bd)', color: 'var(--t2)' }}
                onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Grid ── */}
      {isLoading ? (
        <p style={{ color: 'var(--t3)' }}>Loading…</p>
      ) : (
        <DataGridTable rowData={purchases} columnDefs={colDefs} getRowId={(p: any) => p.data.id} emptyMessage="No purchases recorded yet." height={500} />
      )}

      {/* ── Confirm dialogs ── */}
      <ConfirmDialog
        open={!!toCancel}
        title={`Cancel purchase ${toCancel?.id}?`}
        message="This will mark it as cancelled. The record is kept for audit."
        confirmLabel="Yes, Cancel"
        danger
        loading={cancel.isPending}
        onConfirm={async () => { if (toCancel) { await cancel.mutateAsync({ id: toCancel.id, advance_paid: false }); notify(`${toCancel.id} cancelled`, 'success'); setToCancel(null); } }}
        onCancel={() => setToCancel(null)}
      />

      {/* ── Record Payment Modal ── */}
      {payingCP && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setPayingCP(null); }}>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 28, width: 440, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Record Payment</h3>
              <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4 }}>
                {payingCP.id} — {payingCP.vendor_name} · {payingCP.category}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, background: 'var(--bg2)', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--t3)' }}>Total <strong style={{ color: 'var(--t1)' }}>{formatINR(payingCP.total_paise)}</strong></span>
              <span style={{ color: 'var(--t3)' }}>Paid <strong style={{ color: 'var(--sage)' }}>{formatINR(payingCP.paid_paise ?? 0)}</strong></span>
              <span style={{ color: 'var(--t3)' }}>Due <strong style={{ color: 'var(--red)' }}>{formatINR(payingCP.balance_paise ?? payingCP.total_paise)}</strong></span>
            </div>
            {/* Vendor advance banner */}
            {(() => {
              const vendor = vendors.find((v: any) => v.id === payingCP.vendor_id);
              const adv = vendor?.advance_paise ?? 0;
              if (adv <= 0) return null;
              return (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--sageW)', border: '1px solid var(--sage)', borderRadius: 6, padding: '10px 14px', cursor: 'pointer', marginBottom: 12 }}>
                  <input type="checkbox" checked={payApplyAdvance} onChange={e => setPayApplyAdvance(e.target.checked)} />
                  <span style={{ fontSize: 13 }}>
                    Apply vendor advance <strong style={{ color: 'var(--sage)' }}>{formatINR(adv)}</strong> towards this payment
                  </span>
                </label>
              );
            })()}
            <form onSubmit={handlePaySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Amount *</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {(['full', 'custom'] as const).map(opt => (
                    <button key={opt} type="button" onClick={() => setPayAmount(opt)} style={{
                      padding: '7px 14px', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: '1px solid var(--bd)',
                      background: payAmount === opt ? 'var(--rust)' : 'transparent',
                      color: payAmount === opt ? '#fff' : 'var(--t2)',
                    }}>
                      {opt === 'full'
                        ? `Full — ${formatINR(payingCP.balance_paise ?? payingCP.total_paise)}`
                        : 'Custom'}
                    </button>
                  ))}
                </div>
                {payAmount === 'custom' && (
                  <input type="number" min="0.01" step="0.01" required
                    style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 5, color: 'var(--t1)', fontSize: 13, padding: '7px 10px', width: '100%', boxSizing: 'border-box' }}
                    value={payCustom} onChange={e => setPayCustom(e.target.value)}
                    placeholder="Amount in ₹" onFocus={selectOnFocus} />
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Mode *</label>
                  <select style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 5, color: 'var(--t1)', fontSize: 13, padding: '7px 10px', width: '100%' }}
                    value={payMode} onChange={e => setPayMode(e.target.value)} required>
                    {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Date *</label>
                  <input type="date"
                    style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 5, color: 'var(--t1)', fontSize: 13, padding: '7px 10px', width: '100%', boxSizing: 'border-box' }}
                    value={payDate} onChange={e => setPayDate(e.target.value)} required />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>UTR / Reference</label>
                <input
                  style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 5, color: 'var(--t1)', fontSize: 13, padding: '7px 10px', width: '100%', boxSizing: 'border-box' }}
                  value={payUtr} onChange={e => setPayUtr(e.target.value)} placeholder="Transaction ID (optional)" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Notes</label>
                <input
                  style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 5, color: 'var(--t1)', fontSize: 13, padding: '7px 10px', width: '100%', boxSizing: 'border-box' }}
                  value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Optional" />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setPayingCP(null)}
                  style={{ padding: '7px 16px', background: 'transparent', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={createPayment.isPending}
                  style={{ padding: '7px 16px', background: 'var(--rust)', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {createPayment.isPending ? 'Saving…' : `Record ${payAmount === 'full' ? formatINR(payingCP.balance_paise ?? payingCP.total_paise) : 'Payment'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel-with-advance choice overlay */}
      {cancelAdvanceCP && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>Cancel {cancelAdvanceCP.id}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--t3)' }}>
              This purchase has <strong style={{ color: 'var(--t1)' }}>{formatINR(cancelAdvanceCP.paid_paise ?? 0)}</strong> already paid.
              What should happen to this amount?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <button onClick={async () => {
                const cp = cancelAdvanceCP;
                setCancelAdvanceCP(null);
                await cancel.mutateAsync({ id: cp.id, advance_paid: true });
                notify(`${cp.id} cancelled — ${formatINR(cp.paid_paise ?? 0)} credited to vendor advance`, 'success');
              }} style={{ background: 'var(--sage)', color: '#fff', border: 'none', borderRadius: 6, padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Adjust against future purchase</div>
                <div style={{ fontWeight: 400, fontSize: 12, opacity: 0.85, marginTop: 3 }}>
                  {formatINR(cancelAdvanceCP.paid_paise ?? 0)} credited to vendor advance
                </div>
              </button>
              <button onClick={async () => {
                const cp = cancelAdvanceCP;
                setCancelAdvanceCP(null);
                await cancel.mutateAsync({ id: cp.id, advance_paid: false });
                notify(`${cp.id} cancelled`, 'success');
              }} style={{ background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 6, padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Write off</div>
                <div style={{ fontWeight: 400, fontSize: 12, opacity: 0.85, marginTop: 3 }}>
                  Treat the {formatINR(cancelAdvanceCP.paid_paise ?? 0)} as a loss
                </div>
              </button>
            </div>
            <button onClick={() => setCancelAdvanceCP(null)} style={{ background: 'transparent', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: 5, padding: '7px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 600, width: '100%' }}>
              Go Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
