import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GST_RATE, GST_RATE_LABEL, VARIETIES } from '@modernex/shared';
import {
  usePurchaseOrders, useVendors, useCreatePurchaseOrder, useCreatePayment,
  useDeletePurchaseOrder, useUpdatePOStatus, useUpdatePurchaseOrder,
} from '@/hooks/useApi';
import { formatINR, numericInputValue, selectOnFocus } from '@/utils/format';
import { useToastStore, useAuthStore } from '@/store';

// ── Status metadata ──────────────────────────────────────────────────────────
type StatusMeta = { label: string; color: string; bg: string; next: string | null; nextLabel: string };
const STATUS: Record<string, StatusMeta> = {
  new:       { label: 'New',       color: 'var(--blue)',  bg: 'var(--blueW)',  next: 'approved', nextLabel: 'Approve' },
  received:  { label: 'Received',  color: 'var(--amber)', bg: 'var(--amberW)', next: 'approved', nextLabel: 'Approve' },
  approved:  { label: 'Approved',  color: 'var(--sage)',  bg: 'var(--sageW)',  next: 'closed',   nextLabel: 'Close' },
  closed:    { label: 'Closed',    color: 'var(--t2)',    bg: 'var(--bg3)',    next: null,       nextLabel: '' },
  cancelled: { label: 'Cancelled', color: 'var(--t3)',    bg: 'var(--bg3)',    next: null,       nextLabel: '' },
};
const STATUS_FALLBACK: StatusMeta = { label: 'Unknown', color: 'var(--t3)', bg: 'var(--bg3)', next: null, nextLabel: '' };

// ── Shared micro-styles ──────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 5,
  color: 'var(--t1)', fontSize: 13, padding: '7px 10px', width: '100%', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: '0.05em', display: 'block', marginBottom: 4,
};
const btn = (bg: string, color = '#fff', border = 'none'): React.CSSProperties => ({
  padding: '7px 16px', background: bg, color, border, borderRadius: 5,
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
});

// ── POForm (shared between New and Edit) ─────────────────────────────────────
interface POFormState {
  vendor_id: string; variety: string; blocks: number; cft: number;
  rate_per_cft_paise: number; transport_paise: number; notes: string; date: string;
  block_number: string; incoterm: string; defect_clause: string; allowance_pct: number;
}
const BLANK_FORM = (): POFormState => ({
  vendor_id: '', variety: '', blocks: 1, cft: 0, rate_per_cft_paise: 0,
  transport_paise: 0, notes: '', date: new Date().toISOString().slice(0, 10),
  block_number: '', incoterm: '', defect_clause: '', allowance_pct: 0,
});
const INCOTERMS = ['', 'EXW', 'FOB', 'CIF', 'DAP', 'DDP', 'FCA'];

// Strip fields that would fail server-side validation. `incoterm` is an enum on
// the API, so an empty string (the "— none —" option) must be omitted, not sent
// as '' — otherwise create/edit 400s. `date` isn't an editable PO field.
function cleanPOPayload(form: POFormState): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...form };
  if (!payload.incoterm) delete payload.incoterm;
  return payload;
}

function POForm({ vendors, form, setForm, onSubmit, isPending, onCancel, title, submitLabel }: {
  vendors: any[]; form: POFormState; setForm: (f: POFormState) => void;
  onSubmit: (e: React.FormEvent) => void; isPending: boolean; onCancel: () => void; title: string; submitLabel: string;
}) {
  const [dims, setDims] = useState({ l: '', w: '', h: '' });

  // Auto-calculate CBM (cubic metres) from L×W×H (cm) whenever any dimension changes.
  // Blocks are priced per CBM; 1 m³ = 1,000,000 cm³.
  const handleDim = (k: 'l' | 'w' | 'h', v: string) => {
    const next = { ...dims, [k]: v };
    setDims(next);
    const l = parseFloat(next.l), w = parseFloat(next.w), h = parseFloat(next.h);
    if (l > 0 && w > 0 && h > 0) {
      const cbm = +(l * w * h / 1_000_000).toFixed(3);
      setForm({ ...form, cft: cbm });
    }
  };

  const taxable = Math.round(form.cft * form.rate_per_cft_paise) + (form.transport_paise || 0);
  const gst = Math.round(taxable * GST_RATE);
  const total = taxable + gst;

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>{title}</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>Date *</label>
          <input type="date" style={inp} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div>
          <label style={lbl}>Vendor *</label>
          <select style={{ ...inp, cursor: 'pointer' }} value={form.vendor_id}
            onChange={e => setForm({ ...form, vendor_id: e.target.value })} required>
            <option value="">— select vendor —</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label style={lbl}>Variety *</label>
        <select style={{ ...inp, cursor: 'pointer', marginBottom: 4 }}
          value={VARIETIES.includes(form.variety) ? form.variety : form.variety ? '__custom__' : ''}
          onChange={e => { if (e.target.value !== '__custom__') setForm({ ...form, variety: e.target.value }); }}
          required={!form.variety}>
          <option value="">— select variety —</option>
          {VARIETIES.map((v: string) => <option key={v} value={v}>{v}</option>)}
          {form.variety && !VARIETIES.includes(form.variety) && <option value="__custom__">{form.variety} (custom)</option>}
        </select>
        <input type="text" style={{ ...inp, fontSize: 12 }} placeholder="Or type custom variety…"
          value={!VARIETIES.includes(form.variety) ? form.variety : ''}
          onChange={e => setForm({ ...form, variety: e.target.value })} />
      </div>

      {/* Datalist with common cm values 50–400 in steps of 10, fractions allowed */}
      <datalist id="dim-sizes">
        {Array.from({ length: 36 }, (_, i) => 50 + i * 10).map(v => <option key={v} value={v} />)}
      </datalist>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>Blocks *</label>
          <input type="number" style={inp} min="1" value={numericInputValue(form.blocks, false)}
            onChange={e => setForm({ ...form, blocks: parseInt(e.target.value) || 1 })}
            onFocus={selectOnFocus} required />
        </div>
        <div>
          <label style={lbl}>Length (cm)</label>
          <input list="dim-sizes" type="number" style={inp} min="0" step="any" placeholder="e.g. 270"
            value={dims.l} onChange={e => handleDim('l', e.target.value)} onFocus={selectOnFocus} />
        </div>
        <div>
          <label style={lbl}>Width (cm)</label>
          <input list="dim-sizes" type="number" style={inp} min="0" step="any" placeholder="e.g. 180"
            value={dims.w} onChange={e => handleDim('w', e.target.value)} onFocus={selectOnFocus} />
        </div>
        <div>
          <label style={lbl}>Height (cm)</label>
          <input list="dim-sizes" type="number" style={inp} min="0" step="any" placeholder="e.g. 160"
            value={dims.h} onChange={e => handleDim('h', e.target.value)} onFocus={selectOnFocus} />
        </div>
      </div>

      <div>
        <label style={lbl}>CBM *</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" style={{ ...inp, flex: 1 }} min="0" step="0.001" value={numericInputValue(form.cft)}
              onChange={e => { setDims({ l: '', w: '', h: '' }); setForm({ ...form, cft: parseFloat(e.target.value) || 0 }); }}
              onFocus={selectOnFocus} placeholder="auto-filled from L×W×H (cm) or enter m³" required />
            {form.cft > 0 && <div style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>= {(form.cft * 35.3147).toFixed(2)} CFT</div>}
          </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>Rate/CBM (₹) *</label>
          <input type="number" style={inp} min="0" step="0.01"
            value={numericInputValue(form.rate_per_cft_paise / 100)}
            onChange={e => setForm({ ...form, rate_per_cft_paise: Math.round((parseFloat(e.target.value) || 0) * 100) })}
            onFocus={selectOnFocus} required />
        </div>
        <div>
          <label style={lbl}>Transport (₹)</label>
          <input type="number" style={inp} min="0" step="0.01"
            value={numericInputValue(form.transport_paise / 100)}
            onChange={e => setForm({ ...form, transport_paise: Math.round((parseFloat(e.target.value) || 0) * 100) })}
            onFocus={selectOnFocus} />
        </div>
      </div>

      {total > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '10px 14px', display: 'flex', gap: 20, fontSize: 13, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--t3)' }}>Taxable: <strong style={{ color: 'var(--t1)' }}>{formatINR(taxable)}</strong></span>
          <span style={{ color: 'var(--t3)' }}>GST ({GST_RATE_LABEL}%): <strong style={{ color: 'var(--t1)' }}>{formatINR(gst)}</strong></span>
          <span style={{ color: 'var(--t3)' }}>Total: <strong style={{ color: 'var(--rust)', fontSize: 15 }}>{formatINR(total)}</strong></span>
        </div>
      )}

      {/* Contract terms (variable-weight procurement) */}
      <details style={{ border: '1px solid var(--bd)', borderRadius: 6, padding: '10px 14px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Contract Terms (Incoterm · block # · allowance · defect clause)
        </summary>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Block #</label>
              <input type="text" style={inp} value={form.block_number}
                onChange={e => setForm({ ...form, block_number: e.target.value })} placeholder="e.g. QB-1842" />
            </div>
            <div>
              <label style={lbl}>Incoterm</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={form.incoterm}
                onChange={e => setForm({ ...form, incoterm: e.target.value })}>
                {INCOTERMS.map(t => <option key={t} value={t}>{t || '— none —'}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Allowance %</label>
              <input type="number" style={inp} min="0" max="100" step="0.5" value={form.allowance_pct}
                onChange={e => setForm({ ...form, allowance_pct: parseFloat(e.target.value) || 0 })}
                onFocus={selectOnFocus} />
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>deductible rough-edge weight</div>
            </div>
          </div>
          <div>
            <label style={lbl}>Defect / Rejection Clause</label>
            <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={form.defect_clause}
              onChange={e => setForm({ ...form, defect_clause: e.target.value })}
              placeholder="e.g. Buyer may reject if hidden cracks appear on water-spray inspection within 7 days of delivery." />
          </div>
        </div>
      </details>

      <div>
        <label style={lbl}>Notes</label>
        <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={form.notes}
          onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional remarks…" />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={btn('transparent', 'var(--t2)', '1px solid var(--bd)')}>Cancel</button>
        <button type="submit" disabled={isPending} style={btn('var(--rust)')}>
          {isPending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ── PO Card ──────────────────────────────────────────────────────────────────
function POCard({ po, canManage, onApprove, onCancel, onDelete, onPay, onEdit, onClose, navigate, isSelected, onToggle }: {
  po: any; canManage: boolean;
  onApprove: (id: string) => void; onCancel: (id: string) => void;
  onDelete: (id: string) => void; onPay: (po: any) => void;
  onEdit: (po: any) => void; onClose: (id: string) => void; navigate: (to: string) => void;
  isSelected: boolean; onToggle: (id: string) => void;
}) {
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null);
  const sm: StatusMeta = STATUS[po.status] ?? STATUS_FALLBACK;
  const balance = po.balance_paise ?? (po.total_paise - (po.paid_paise ?? 0));
  const isPaid = (po.paid_paise ?? 0) >= po.total_paise;
  const isPartial = !isPaid && (po.paid_paise ?? 0) > 0;
  const canEdit = canManage && (po.status === 'new');
  const canDel = canManage && (po.status === 'new' || po.status === 'cancelled') && (po.paid_paise ?? 0) === 0;
  const canApprove = canManage && (po.status === 'new' || po.status === 'received');
  const canCancel = canManage && po.status !== 'cancelled' && po.status !== 'closed';
  const canPay = po.status === 'approved' && !isPaid;
  const canClose = canManage && po.status === 'approved' && po.matched_at && isPaid;

  return (
    <div style={{
      background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10,
      overflow: 'hidden', transition: 'box-shadow 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>

      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px 12px' }}>
        {/* Checkbox */}
        <div style={{ flexShrink: 0, paddingTop: 4 }}>
          <input type="checkbox" checked={isSelected} onChange={() => onToggle(po.id)}
            style={{ width: 16, height: 16, accentColor: 'var(--rust)', cursor: 'pointer' }} />
        </div>
        {/* Status pill */}
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 20,
            fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
            background: sm.bg, color: sm.color,
          }}>{sm.label}</span>
        </div>

        {/* PO details */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{po.id}</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              {po.date ? new Date(po.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', marginTop: 3 }}>
            {po.vendor_name || po.vendor_id}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            {po.variety} · <strong style={{ color: 'var(--t2)' }}>{po.blocks} block{po.blocks !== 1 ? 's' : ''}</strong> · {po.cft} CBM
          </div>
        </div>

        {/* Financial summary */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>{formatINR(po.total_paise)}</div>
          {isPaid ? (
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sage)', marginTop: 2 }}>✓ Fully Paid</div>
          ) : isPartial ? (
            <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>
              Partial · Due <strong>{formatINR(balance)}</strong>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>
              Unpaid · Due <strong>{formatINR(balance)}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Confirm strip */}
      {confirmAction && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
          background: confirmAction === 'delete' ? 'rgba(220,50,50,0.08)' : 'rgba(100,100,100,0.06)',
          borderTop: '1px solid var(--bd)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: confirmAction === 'delete' ? 'var(--red)' : 'var(--t2)', flex: 1 }}>
            {confirmAction === 'delete' ? `Permanently delete ${po.id}?` : `Cancel PO ${po.id}?`}
          </span>
          <button onClick={() => {
            if (confirmAction === 'delete') onDelete(po.id);
            else onCancel(po.id);
            setConfirmAction(null);
          }} style={btn(confirmAction === 'delete' ? 'var(--red)' : 'var(--t2)')}>
            Confirm
          </button>
          <button onClick={() => setConfirmAction(null)}
            style={btn('transparent', 'var(--t2)', '1px solid var(--bd)')}>
            Back
          </button>
        </div>
      )}

      {/* Action bar */}
      {!confirmAction && (
        <div style={{
          display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
          padding: '10px 18px', background: 'var(--bg2)', borderTop: '1px solid var(--bd)',
        }}>
          {/* Primary: Approve */}
          {canApprove && (
            <button onClick={() => onApprove(po.id)}
              style={{ ...btn('var(--rust)'), display: 'flex', alignItems: 'center', gap: 5 }}>
              ✓ Approve
            </button>
          )}

          {/* Primary: Pay */}
          {canPay && (
            <button onClick={() => onPay(po)}
              style={{ ...btn('var(--rust)'), display: 'flex', alignItems: 'center', gap: 5 }}>
              ₹ Record Payment
            </button>
          )}

          {/* Primary: Close (matched + fully paid) */}
          {canClose && (
            <button onClick={() => onClose(po.id)}
              style={{ ...btn('var(--rust)'), display: 'flex', alignItems: 'center', gap: 5 }}>
              ◼ Close PO
            </button>
          )}

          {/* Secondary: View full receipt */}
          <button onClick={() => navigate(`/purchase/${(po.id || '').replace(/\//g, '~')}`)}
            style={btn('var(--bg1)', 'var(--t1)', '1px solid var(--bd)')}>
            View ↗
          </button>

          {/* Secondary: Edit */}
          {canEdit && (
            <button onClick={() => onEdit(po)}
              style={btn('transparent', 'var(--t2)', '1px solid var(--bd)')}>
              ✎ Edit
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Danger: Cancel */}
          {canCancel && (
            <button onClick={() => setConfirmAction('cancel')}
              style={{ ...btn('transparent', 'var(--red)', '1px solid var(--bd)'), fontSize: 11 }}>
              Cancel PO
            </button>
          )}

          {/* Danger: Delete */}
          {canDel && (
            <button onClick={() => setConfirmAction('delete')}
              style={{ ...btn('transparent', 'var(--red)', '1px solid var(--bd)'), fontSize: 11 }}>
              ⊗ Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── PO Table (compact list view) ─────────────────────────────────────────────
function POTable({ pos, canManage, selectedIds, onToggle, onSelectAll, onApprove, onCancel, onDelete, onPay, onEdit, onClose, navigate }: {
  pos: any[]; canManage: boolean; selectedIds: Set<string>;
  onToggle: (id: string) => void; onSelectAll: (ids: string[]) => void;
  onApprove: (id: string) => void; onCancel: (id: string) => void;
  onDelete: (id: string) => void; onPay: (po: any) => void;
  onEdit: (po: any) => void; onClose: (id: string) => void; navigate: (to: string) => void;
}) {
  const th: React.CSSProperties = {
    textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700,
    color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.04em',
    background: 'var(--bg2)', borderBottom: '1px solid var(--bd)', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '8px 10px', fontSize: 12, color: 'var(--t2)', borderBottom: '1px solid var(--bd)', whiteSpace: 'nowrap',
  };
  const allSel = pos.length > 0 && pos.every(p => selectedIds.has(p.id));

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--bd)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 36 }}>
              <input type="checkbox" checked={allSel} onChange={() => onSelectAll(pos.map(p => p.id))}
                style={{ width: 15, height: 15, accentColor: 'var(--rust)', cursor: 'pointer' }} />
            </th>
            <th style={th}>PO ID</th>
            <th style={th}>Date</th>
            <th style={th}>Vendor</th>
            <th style={th}>Variety</th>
            <th style={{ ...th, textAlign: 'right' }}>Blocks</th>
            <th style={{ ...th, textAlign: 'right' }}>Total</th>
            <th style={{ ...th, textAlign: 'right' }}>Balance</th>
            <th style={{ ...th, textAlign: 'center' }}>Status</th>
            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pos.map(po => {
            const sm: StatusMeta = STATUS[po.status] ?? STATUS_FALLBACK;
            const balance = po.balance_paise ?? (po.total_paise - (po.paid_paise ?? 0));
            const isPaid = (po.paid_paise ?? 0) >= po.total_paise;
            const canApprove = canManage && (po.status === 'new' || po.status === 'received');
            const canPay = po.status === 'approved' && !isPaid;
            const canEdit = canManage && po.status === 'new';
            const canDel = canManage && (po.status === 'new' || po.status === 'cancelled') && (po.paid_paise ?? 0) === 0;
            const canCancel = canManage && po.status !== 'cancelled' && po.status !== 'closed';
            const canClose = canManage && po.status === 'approved' && po.matched_at && isPaid;
            const sel = selectedIds.has(po.id);
            return (
              <tr key={po.id} style={{ background: sel ? 'var(--rustW, rgba(180,80,40,0.06))' : 'var(--bg1)' }}>
                <td style={td}>
                  <input type="checkbox" checked={sel} onChange={() => onToggle(po.id)}
                    style={{ width: 15, height: 15, accentColor: 'var(--rust)', cursor: 'pointer' }} />
                </td>
                <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: 'var(--t1)' }}>{po.id}</td>
                <td style={td}>{po.date ? new Date(po.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</td>
                <td style={{ ...td, fontWeight: 600, color: 'var(--t1)' }}>{po.vendor_name || po.vendor_id}</td>
                <td style={td}>{po.variety}</td>
                <td style={{ ...td, textAlign: 'right' }}>{po.blocks}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: 'var(--t1)' }}>{formatINR(po.total_paise)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: isPaid ? 'var(--sage)' : 'var(--red)' }}>
                  {isPaid ? '✓ Paid' : formatINR(balance)}
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: sm.bg, color: sm.color }}>{sm.label}</span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    {canApprove && <button onClick={() => onApprove(po.id)} title="Approve" style={{ ...btn('var(--rust)'), padding: '3px 8px', fontSize: 10 }}>✓</button>}
                    {canPay && <button onClick={() => onPay(po)} title="Record Payment" style={{ ...btn('var(--rust)'), padding: '3px 8px', fontSize: 10 }}>₹</button>}
                    {canClose && <button onClick={() => onClose(po.id)} title="Close PO" style={{ ...btn('var(--rust)'), padding: '3px 8px', fontSize: 10 }}>◼</button>}
                    <button onClick={() => navigate(`/purchase/${(po.id || '').replace(/\//g, '~')}`)} title="View" style={{ ...btn('var(--bg2)', 'var(--t1)', '1px solid var(--bd)'), padding: '3px 8px', fontSize: 10 }}>↗</button>
                    {canEdit && <button onClick={() => onEdit(po)} title="Edit" style={{ ...btn('transparent', 'var(--t2)', '1px solid var(--bd)'), padding: '3px 8px', fontSize: 10 }}>✎</button>}
                    {canCancel && <button onClick={() => onCancel(po.id)} title="Cancel PO" style={{ ...btn('transparent', 'var(--red)', '1px solid var(--bd)'), padding: '3px 8px', fontSize: 10 }}>✕</button>}
                    {canDel && <button onClick={() => onDelete(po.id)} title="Delete" style={{ ...btn('transparent', 'var(--red)', '1px solid var(--bd)'), padding: '3px 8px', fontSize: 10 }}>⊗</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function PurchasePage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() =>
    (localStorage.getItem('po-view') as 'cards' | 'list') || 'cards');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'approve' | 'cancel' | 'delete' | null>(null);
  const [modal, setModal] = useState<'new' | 'edit' | 'pay' | 'bulk-confirm' | null>(null);
  const [editingPO, setEditingPO] = useState<any | null>(null);
  const [payingPO, setPayingPO] = useState<any | null>(null);
  const [newForm, setNewForm] = useState<POFormState>(BLANK_FORM());
  const [editForm, setEditForm] = useState<POFormState>(BLANK_FORM());
  const [payAmount, setPayAmount] = useState<'full' | 'custom'>('full');
  const [payCustom, setPayCustom] = useState('');
  const [payMode, setPayMode] = useState('NEFT');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payUtr, setPayUtr] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payApplyAdvance, setPayApplyAdvance] = useState(false);
  // cancel-with-advance: id of PO pending cancel choice
  const [cancelAdvancePO, setCancelAdvancePO] = useState<any | null>(null);

  const { data: posData, isLoading } = usePurchaseOrders({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });
  const { data: vendorsData } = useVendors({});
  const createPO = useCreatePurchaseOrder();
  const updatePO = useUpdatePurchaseOrder();
  const deletePO = useDeletePurchaseOrder();
  const updateStatus = useUpdatePOStatus();
  const createPayment = useCreatePayment();
  const { notify } = useToastStore();
  const { user } = useAuthStore();
  const canManage = user?.role === 'admin' || user?.role === 'accounts';

  const allPos: any[] = usePurchaseOrders({}).data?.purchase_orders || [];
  const pos: any[] = posData?.purchase_orders || [];
  const vendors: any[] = vendorsData?.vendors || [];

  // Status counts for tabs
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allPos.length };
    for (const p of allPos) c[p.status] = (c[p.status] || 0) + 1;
    return c;
  }, [allPos]);

  // Summary stats
  const stats = useMemo(() => {
    const pending = allPos.filter(p => p.status === 'new' || p.status === 'received').length;
    const totalDue = allPos.filter(p => p.status !== 'cancelled')
      .reduce((s, p) => s + (p.balance_paise ?? (p.total_paise - (p.paid_paise ?? 0))), 0);
    return { pending, totalDue };
  }, [allPos]);

  const handleApprove = useCallback((id: string) => {
    updateStatus.mutate({ id, status: 'approved' }, {
      onSuccess: () => notify(`PO ${id} approved`, 'success'),
      onError: (e: any) => notify(e.message || 'Failed to approve', 'error'),
    });
  }, [updateStatus, notify]);

  const handleCancel = useCallback((id: string) => {
    const po = allPos.find((p: any) => p.id === id);
    // If there are partial payments, ask about advance
    if (po && (po.paid_paise ?? 0) > 0) {
      setCancelAdvancePO(po);
      return;
    }
    updateStatus.mutate({ id, status: 'cancelled' }, {
      onSuccess: () => notify(`PO ${id} cancelled`, 'success'),
      onError: (e: any) => notify(e.message || 'Failed to cancel', 'error'),
    });
  }, [updateStatus, notify, allPos]);

  const handleDelete = useCallback((id: string) => {
    deletePO.mutate(id, {
      onSuccess: () => notify(`PO ${id} deleted`, 'success'),
      onError: (e: any) => notify(e.message || 'Failed to delete', 'error'),
    });
  }, [deletePO, notify]);

  const handleClose = useCallback((id: string) => {
    updateStatus.mutate({ id, status: 'closed' }, {
      onSuccess: () => notify(`PO ${id} closed`, 'success'),
      onError: (e: any) => notify(e.message || 'Failed to close', 'error'),
    });
  }, [updateStatus, notify]);

  const handlePay = useCallback((po: any) => {
    setPayingPO(po);
    setPayAmount('full');
    setPayCustom('');
    setPayMode('NEFT');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayUtr('');
    setPayNotes('');
    setPayApplyAdvance(false);
    setModal('pay');
  }, []);

  const handleEdit = useCallback((po: any) => {
    setEditingPO(po);
    setEditForm({
      vendor_id: po.vendor_id || '',
      variety: po.variety || '',
      blocks: po.blocks || 1,
      cft: po.cft || 0,
      rate_per_cft_paise: po.rate_per_cft_paise || 0,
      transport_paise: po.transport_paise || 0,
      notes: po.notes || '',
      date: po.date || new Date().toISOString().slice(0, 10),
      block_number: po.block_number || '',
      incoterm: po.incoterm || '',
      defect_clause: po.defect_clause || '',
      allowance_pct: po.allowance_pct || 0,
    });
    setModal('edit');
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds(prev => (prev.size === ids.length ? new Set() : new Set(ids)));
  }, []);

  const handleBulkAction = useCallback((action: 'approve' | 'cancel' | 'delete') => {
    setBulkAction(action);
    setModal('bulk-confirm');
  }, []);

  async function executeBulk() {
    if (!bulkAction) return;
    const poMap = new Map(allPos.map((p: any) => [p.id, p]));
    // Filter to only IDs that are eligible for this action
    const eligible = [...selectedIds].filter(id => {
      const po = poMap.get(id);
      if (!po) return false;
      if (bulkAction === 'approve') return po.status === 'new' || po.status === 'received';
      if (bulkAction === 'cancel') return po.status !== 'cancelled';
      if (bulkAction === 'delete') return (po.status === 'new' || po.status === 'cancelled') && (po.paid_paise ?? 0) === 0;
      return false;
    });
    const skipped = selectedIds.size - eligible.length;
    if (eligible.length === 0) {
      const verb = bulkAction === 'approve' ? 'approve' : bulkAction === 'cancel' ? 'cancel' : 'delete';
      notify(`No selected POs can be ${verb}d in their current state`, 'error');
      setModal(null); setBulkAction(null); return;
    }
    const results = await Promise.allSettled(
      eligible.map(id =>
        bulkAction === 'delete'
          ? deletePO.mutateAsync(id)
          : updateStatus.mutateAsync({ id, status: bulkAction === 'approve' ? 'approved' : 'cancelled' }),
      ),
    );
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    const verb = bulkAction === 'delete' ? 'Deleted' : bulkAction === 'approve' ? 'Approved' : 'Cancelled';
    if (ok > 0) notify(`${verb} ${ok} PO${ok !== 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} skipped — ineligible)` : ''}`, 'success');
    if (fail > 0) notify(`${fail} operation${fail !== 1 ? 's' : ''} failed`, 'error');
    setSelectedIds(new Set());
    setModal(null);
    setBulkAction(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createPO.mutateAsync(cleanPOPayload(newForm));
      notify('Purchase order created', 'success');
      setModal(null);
      setNewForm(BLANK_FORM());
    } catch (err: any) { notify(err.message || 'Failed to create PO', 'error'); }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPO) return;
    try {
      await updatePO.mutateAsync({ id: editingPO.id, data: cleanPOPayload(editForm) });
      notify(`PO ${editingPO.id} updated`, 'success');
      setModal(null);
      setEditingPO(null);
    } catch (err: any) { notify(err.message || 'Failed to update PO', 'error'); }
  }

  async function handlePaySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payingPO) return;
    const balance = payingPO.balance_paise ?? (payingPO.total_paise - (payingPO.paid_paise ?? 0));
    const vendor = vendors.find((v: any) => v.id === payingPO.vendor_id);
    const vendorAdvance = vendor?.advance_paise ?? 0;
    const advanceToApply = payApplyAdvance ? Math.min(vendorAdvance, balance) : 0;
    // cash amount = balance - advance used; must be > 0 for 'custom', but full can be 0 if fully covered
    let cashAmount: number;
    if (payAmount === 'full') {
      cashAmount = Math.max(0, balance - advanceToApply);
    } else {
      cashAmount = Math.round((parseFloat(payCustom) || 0) * 100);
    }
    // total credited = cash + advance
    const totalCredit = cashAmount + advanceToApply;
    if (totalCredit <= 0) { notify('Enter a valid amount', 'error'); return; }
    // If fully covered by advance, amount_paise must still be > 0 per schema;
    // treat 0-cash as a ₹0 adjustment — use advanceToApply as amount_paise instead
    const payloadAmount = cashAmount > 0 ? cashAmount : advanceToApply;
    try {
      await createPayment.mutateAsync({
        po_id: payingPO.id, type: 'payment',
        amount_paise: payloadAmount, mode: cashAmount > 0 ? payMode : 'Other',
        utr: payUtr || undefined, date: payDate,
        notes: payNotes || (advanceToApply > 0 ? `Advance adjusted: ${formatINR(advanceToApply)}` : undefined),
        party: payingPO.vendor_name || payingPO.vendor_id,
        apply_advance_paise: advanceToApply > 0 ? advanceToApply : undefined,
      });
      notify(`Payment recorded${advanceToApply > 0 ? ` (${formatINR(advanceToApply)} advance applied)` : ''}`, 'success');
      setModal(null);
      setPayingPO(null);
    } catch (err: any) { notify(err.message || 'Failed to record payment', 'error'); }
  }

  const TABS = [
    { key: 'all', label: 'All' },
    { key: 'new', label: 'New' },
    { key: 'received', label: 'Received' },
    { key: 'approved', label: 'Approved' },
    { key: 'closed', label: 'Closed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="page">
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>Purchase Orders</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t3)' }}>Manage raw material and block purchases</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--bd)', borderRadius: 6, overflow: 'hidden' }}>
            {(['cards', 'list'] as const).map(v => (
              <button key={v} onClick={() => { setViewMode(v); localStorage.setItem('po-view', v); }}
                title={v === 'cards' ? 'Card view' : 'List view'}
                style={{
                  padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: viewMode === v ? 'var(--rust)' : 'transparent',
                  color: viewMode === v ? '#fff' : 'var(--t3)',
                }}>
                {v === 'cards' ? '▦ Cards' : '☰ List'}
              </button>
            ))}
          </div>
          {canManage && (
            <button onClick={() => setModal('new')} style={{ ...btn('var(--rust)'), fontSize: 13, padding: '9px 22px' }}>
              + New PO
            </button>
          )}
        </div>
      </div>

      {/* Workflow pipeline indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20, background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 16px', overflowX: 'auto' }}>
        {(['new', 'received', 'approved', 'closed'] as const).map((s, i) => {
          const m: StatusMeta = STATUS[s] ?? STATUS_FALLBACK;
          const cnt = counts[s] || 0;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {i > 0 && <div style={{ width: 28, height: 2, background: 'var(--bd)', margin: '0 2px' }} />}
              <div onClick={() => { setStatusFilter(s); setSelectedIds(new Set()); }} style={{ cursor: 'pointer', textAlign: 'center', padding: '4px 14px', borderRadius: 20, background: statusFilter === s ? m.bg : 'transparent', transition: 'background 0.15s' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: m.color, lineHeight: 1 }}>{cnt}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: m.color, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 1 }}>{m.label}</div>
              </div>
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        {stats.totalDue > 0 && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Total Outstanding</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>{formatINR(stats.totalDue)}</div>
          </div>
        )}
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--bd)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setStatusFilter(t.key); setSelectedIds(new Set()); }} style={{
            padding: '7px 16px', border: 'none', borderRadius: '5px 5px 0 0', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
            background: statusFilter === t.key ? 'var(--rust)' : 'transparent',
            color: statusFilter === t.key ? '#fff' : 'var(--t3)',
            borderBottom: statusFilter === t.key ? '2px solid var(--rust)' : '2px solid transparent',
          }}>
            {t.label}
            {counts[t.key] != null && (
              <span style={{
                marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px',
                borderRadius: 10, display: 'inline-block',
                background: statusFilter === t.key ? 'rgba(255,255,255,0.25)' : 'var(--bg2)',
                color: statusFilter === t.key ? '#fff' : 'var(--t3)',
              }}>{counts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* PO cards */}
      {isLoading ? (
        <div style={{ color: 'var(--t3)', fontSize: 13, padding: 24, textAlign: 'center' }}>Loading…</div>
      ) : pos.length === 0 ? (
        <div style={{ color: 'var(--t3)', fontSize: 13, padding: 40, textAlign: 'center', background: 'var(--bg2)', borderRadius: 8 }}>
          {statusFilter === 'all' ? 'No purchase orders yet. Click + New PO to create one.' : `No ${statusFilter} purchase orders.`}
        </div>
      ) : (
        <>
          {/* Select-all / bulk toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, marginBottom: 8 }}>
            <input type="checkbox"
              checked={pos.length > 0 && pos.every(p => selectedIds.has(p.id))}
              onChange={() => handleSelectAll(pos.map(p => p.id))}
              style={{ width: 16, height: 16, accentColor: 'var(--rust)', cursor: 'pointer' }} />
            <span style={{ fontSize: 12, color: 'var(--t3)', flex: 1 }}>
              {selectedIds.size > 0
                ? `${selectedIds.size} of ${pos.length} selected`
                : `${pos.length} purchase order${pos.length !== 1 ? 's' : ''}`}
            </span>
            {selectedIds.size > 0 && canManage && (
              <>
                <button onClick={() => handleBulkAction('approve')} style={{ ...btn('var(--rust)'), fontSize: 11, padding: '5px 12px' }}>✓ Approve All</button>
                <button onClick={() => handleBulkAction('cancel')} style={{ ...btn('transparent', 'var(--red)', '1px solid var(--bd)'), fontSize: 11, padding: '5px 12px' }}>Cancel All</button>
                <button onClick={() => handleBulkAction('delete')} style={{ ...btn('transparent', 'var(--red)', '1px solid var(--bd)'), fontSize: 11, padding: '5px 12px' }}>⊗ Delete All</button>
              </>
            )}
          </div>
          {viewMode === 'cards' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pos.map(po => (
                <POCard key={po.id} po={po} canManage={canManage}
                  onApprove={handleApprove} onCancel={handleCancel}
                  onDelete={handleDelete} onPay={handlePay}
                  onEdit={handleEdit} onClose={handleClose} navigate={navigate}
                  isSelected={selectedIds.has(po.id)} onToggle={handleToggleSelect} />
              ))}
            </div>
          ) : (
            <POTable pos={pos} canManage={canManage} selectedIds={selectedIds}
              onToggle={handleToggleSelect} onSelectAll={handleSelectAll}
              onApprove={handleApprove} onCancel={handleCancel}
              onDelete={(id) => { if (window.confirm(`Delete PO ${id}? This cannot be undone.`)) handleDelete(id); }}
              onPay={handlePay} onEdit={handleEdit} onClose={handleClose} navigate={navigate} />
          )}
        </>
      )}

      {/* Modal backdrop */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 28, width: modal === 'pay' ? 420 : modal === 'bulk-confirm' ? 480 : 640, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* New PO */}
            {modal === 'new' && (
              <POForm title="New Purchase Order" submitLabel="Create PO" vendors={vendors} form={newForm} setForm={setNewForm}
                onSubmit={handleCreate} isPending={createPO.isPending} onCancel={() => setModal(null)} />
            )}

            {/* Bulk Confirm */}
            {modal === 'bulk-confirm' && bulkAction && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: bulkAction === 'delete' ? 'var(--red)' : 'var(--t1)' }}>
                  {bulkAction === 'approve' ? 'Approve' : bulkAction === 'cancel' ? 'Cancel' : 'Delete'}{' '}
                  {selectedIds.size} PO{selectedIds.size !== 1 ? 's' : ''}?
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
                  {bulkAction === 'delete'
                    ? `Permanently delete ${selectedIds.size} purchase order(s). This cannot be undone.`
                    : bulkAction === 'cancel'
                    ? `Mark ${selectedIds.size} purchase order(s) as cancelled.`
                    : `Approve ${selectedIds.size} purchase order(s).`}
                </p>
                <div style={{ fontSize: 12, color: 'var(--t3)', background: 'var(--bg2)', padding: '8px 12px', borderRadius: 6, fontFamily: 'monospace', maxHeight: 100, overflowY: 'auto', wordBreak: 'break-all' }}>
                  {[...selectedIds].join(' · ')}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => { setModal(null); setBulkAction(null); }}
                    style={btn('transparent', 'var(--t2)', '1px solid var(--bd)')}>Back</button>
                  <button type="button" onClick={executeBulk}
                    style={btn(bulkAction === 'approve' ? 'var(--sage)' : 'var(--red)')}>
                    Confirm {bulkAction === 'approve' ? 'Approve' : bulkAction === 'cancel' ? 'Cancel' : 'Delete'}
                  </button>
                </div>
              </div>
            )}

            {/* Edit PO */}
            {modal === 'edit' && editingPO && (
              <POForm title={`Edit ${editingPO.id}`} submitLabel="Save Changes" vendors={vendors} form={editForm} setForm={setEditForm}
                onSubmit={handleUpdate} isPending={updatePO.isPending} onCancel={() => setModal(null)} />
            )}

            {/* Record Payment */}
            {modal === 'pay' && payingPO && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Record Payment</h3>
                  <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4 }}>{payingPO.id} — {payingPO.vendor_name || payingPO.vendor_id}</div>
                </div>
                <div style={{ display: 'flex', gap: 16, background: 'var(--bg2)', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>
                  <span style={{ color: 'var(--t3)' }}>Total <strong style={{ color: 'var(--t1)' }}>{formatINR(payingPO.total_paise)}</strong></span>
                  <span style={{ color: 'var(--t3)' }}>Paid <strong style={{ color: 'var(--t1)' }}>{formatINR(payingPO.paid_paise ?? 0)}</strong></span>
                  <span style={{ color: 'var(--t3)' }}>Due <strong style={{ color: 'var(--red)' }}>{formatINR(payingPO.balance_paise ?? (payingPO.total_paise - (payingPO.paid_paise ?? 0)))}</strong></span>
                </div>
                {/* Vendor advance banner */}
                {(() => {
                  const vendor = vendors.find((v: any) => v.id === payingPO.vendor_id);
                  const adv = vendor?.advance_paise ?? 0;
                  if (adv <= 0) return null;
                  return (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--sageW)', border: '1px solid var(--sage)', borderRadius: 6, padding: '10px 14px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={payApplyAdvance} onChange={e => setPayApplyAdvance(e.target.checked)} />
                      <span style={{ fontSize: 13 }}>
                        Apply vendor advance <strong style={{ color: 'var(--sage)' }}>{formatINR(adv)}</strong> towards this payment
                      </span>
                    </label>
                  );
                })()}
                <form onSubmit={handlePaySubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={lbl}>Amount *</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {(['full', 'custom'] as const).map(opt => (
                        <button key={opt} type="button" onClick={() => setPayAmount(opt)} style={{
                          padding: '7px 16px', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: '1px solid var(--bd)',
                          background: payAmount === opt ? 'var(--rust)' : 'transparent',
                          color: payAmount === opt ? '#fff' : 'var(--t2)',
                        }}>
                          {opt === 'full'
                            ? `Full — ${formatINR(payingPO.balance_paise ?? (payingPO.total_paise - (payingPO.paid_paise ?? 0)))}`
                            : 'Custom Amount'}
                        </button>
                      ))}
                    </div>
                    {payAmount === 'custom' && (
                      <input type="number" style={inp} min="0.01" step="0.01" required
                        value={payCustom} onChange={e => setPayCustom(e.target.value)}
                        placeholder="Enter amount in ₹" onFocus={selectOnFocus} />
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Mode *</label>
                      <select style={{ ...inp, cursor: 'pointer' }} value={payMode} onChange={e => setPayMode(e.target.value)} required>
                        {['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash', 'Other'].map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Date *</label>
                      <input type="date" style={inp} value={payDate} onChange={e => setPayDate(e.target.value)} required />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>UTR / Reference</label>
                    <input style={inp} value={payUtr} onChange={e => setPayUtr(e.target.value)} placeholder="Transaction ID (optional)" />
                  </div>
                  <div>
                    <label style={lbl}>Notes</label>
                    <input style={inp} value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Optional" />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setModal(null)}
                      style={btn('transparent', 'var(--t2)', '1px solid var(--bd)')}>Cancel</button>
                    <button type="submit" disabled={createPayment.isPending}
                      style={btn('var(--rust)')}>
                      {createPayment.isPending ? 'Saving…' : `Record ${payAmount === 'full' ? formatINR(payingPO.balance_paise ?? (payingPO.total_paise - (payingPO.paid_paise ?? 0))) : 'Payment'}`}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel-with-advance choice overlay */}
      {cancelAdvancePO && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>
              Cancel PO {cancelAdvancePO.id}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--t3)' }}>
              This PO has <strong style={{ color: 'var(--t1)' }}>{formatINR(cancelAdvancePO.paid_paise)}</strong> already paid.
              What should happen to this amount?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <button onClick={() => {
                const id = cancelAdvancePO.id;
                setCancelAdvancePO(null);
                updateStatus.mutate({ id, status: 'cancelled', advance_paid: true }, {
                  onSuccess: () => notify(`PO ${id} cancelled — ${formatINR(cancelAdvancePO.paid_paise)} added to vendor advance`, 'success'),
                  onError: (e: any) => notify(e.message || 'Failed to cancel', 'error'),
                });
              }} style={{ ...btn('var(--rust)'), textAlign: 'left', padding: '12px 16px' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Adjust against future purchase</div>
                <div style={{ fontWeight: 400, fontSize: 12, opacity: 0.85, marginTop: 3 }}>
                  {formatINR(cancelAdvancePO.paid_paise)} credited to vendor advance — apply when paying next PO
                </div>
              </button>
              <button onClick={() => {
                const id = cancelAdvancePO.id;
                setCancelAdvancePO(null);
                updateStatus.mutate({ id, status: 'cancelled', advance_paid: false }, {
                  onSuccess: () => notify(`PO ${id} cancelled`, 'success'),
                  onError: (e: any) => notify(e.message || 'Failed to cancel', 'error'),
                });
              }} style={{ ...btn('transparent', 'var(--red)', '1px solid var(--bd)'), textAlign: 'left', padding: '12px 16px' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Write off</div>
                <div style={{ fontWeight: 400, fontSize: 12, opacity: 0.85, marginTop: 3 }}>
                  Treat the {formatINR(cancelAdvancePO.paid_paise)} as a loss — no adjustment
                </div>
              </button>
            </div>
            <button onClick={() => setCancelAdvancePO(null)} style={{ ...btn('transparent', 'var(--t2)', '1px solid var(--bd)'), width: '100%' }}>
              Go Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
