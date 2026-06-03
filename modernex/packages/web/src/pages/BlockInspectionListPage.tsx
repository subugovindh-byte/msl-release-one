import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useBlockInspections, useVendors, useCreateBlockInspection,
  useRejectBlockInspection, useDeleteBlockInspection,
} from '@/hooks/useApi';
import { VARIETIES } from '@modernex/shared';
import { useToastStore, useAuthStore } from '@/store';
import { numericInputValue, selectOnFocus } from '@/utils/format';

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
  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
});

const GRADE_COLORS: Record<string, { color: string; bg: string }> = {
  'A+': { color: '#15803d', bg: '#dcfce7' },
  'A':  { color: '#1d4ed8', bg: '#dbeafe' },
  'B':  { color: '#92400e', bg: '#fef9c3' },
};
const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  pending:   { color: '#92400e', bg: '#fef9c3' },
  po_raised: { color: '#15803d', bg: '#dcfce7' },
  rejected:  { color: '#dc2626', bg: '#fee2e2' },
};

interface FormState {
  date: string; vendor_id: string; quarry_location: string; variety: string;
  block_count: number; est_cft: number; grade: 'A+' | 'A' | 'B'; defect_note: string; notes: string;
}
const BLANK = (): FormState => ({
  date: new Date().toISOString().slice(0, 10), vendor_id: '', quarry_location: '',
  variety: '', block_count: 1, est_cft: 0, grade: 'A', defect_note: '', notes: '',
});

function NewInspectionModal({ vendors, onClose }: { vendors: any[]; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(BLANK());
  const create = useCreateBlockInspection();
  const toast = useToastStore(s => s.notify);
  const set = (k: keyof FormState, v: any) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.variety) { toast('Variety is required', 'error'); return; }
    create.mutate(
      { ...form },
      {
        onSuccess: () => { toast('Inspection created', 'success'); onClose(); },
        onError: (e: any) => toast(e.response?.data?.error || 'Failed', 'error'),
      }
    );
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--bg0)', borderRadius:10, padding:24, width:'100%', maxWidth:540, maxHeight:'90vh', overflowY:'auto' }}>
        <h3 style={{ margin:'0 0 18px', fontSize:16 }}>New Block Inspection</h3>
        <form onSubmit={submit}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div><label style={lbl}>Date</label>
              <input style={inp} type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
            <div><label style={lbl}>Grade *</label>
              <select style={inp} value={form.grade} onChange={e => set('grade', e.target.value as any)}>
                <option value="A+">A+</option>
                <option value="A">A</option>
                <option value="B">B</option>
              </select></div>
            <div><label style={lbl}>Vendor</label>
              <select style={inp} value={form.vendor_id} onChange={e => set('vendor_id', e.target.value)}>
                <option value="">— None —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select></div>
            <div><label style={lbl}>Variety *</label>
              <select style={inp} value={form.variety} onChange={e => set('variety', e.target.value)} required>
                <option value="">Select…</option>
                {VARIETIES.map(v => <option key={v} value={v}>{v}</option>)}
              </select></div>
            <div><label style={lbl}>Blocks *</label>
              <input style={inp} type="number" min={1} value={numericInputValue(form.block_count, false)}
                onFocus={selectOnFocus} onChange={e => set('block_count', parseInt(e.target.value) || 1)} /></div>
            <div><label style={lbl}>Est. CFT</label>
              <input style={inp} type="number" min={0} step="0.01" value={numericInputValue(form.est_cft)}
                onFocus={selectOnFocus} onChange={e => set('est_cft', parseFloat(e.target.value) || 0)} /></div>
          </div>
          <div style={{ marginTop:12 }}><label style={lbl}>Quarry Location</label>
            <input style={inp} type="text" value={form.quarry_location} onChange={e => set('quarry_location', e.target.value)} placeholder="e.g. Rajasthan, Survey No. 42" /></div>
          <div style={{ marginTop:12 }}><label style={lbl}>Defect / Quality Note</label>
            <textarea style={{ ...inp, height:60, resize:'vertical' }} value={form.defect_note} onChange={e => set('defect_note', e.target.value)} placeholder="Cracks, colour variance, etc." /></div>
          <div style={{ marginTop:12 }}><label style={lbl}>Notes</label>
            <textarea style={{ ...inp, height:60, resize:'vertical' }} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:18 }}>
            <button type="button" style={btn('#f3f4f6','#374151','1px solid #d1d5db')} onClick={onClose}>Cancel</button>
            <button type="submit" style={btn('#2563eb')} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Create Inspection'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BlockInspectionListPage() {
  const navigate = useNavigate();
  const toast = useToastStore(s => s.notify);
  const role = useAuthStore(s => s.user?.role);
  const canWrite = role === 'admin' || role === 'accounts' || role === 'yard';
  const canAdmin = role === 'admin' || role === 'accounts';

  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);

  const { data: inspData, isLoading } = useBlockInspections(statusFilter ? { status: statusFilter } : undefined);
  const { data: vendorData } = useVendors();
  const reject = useRejectBlockInspection();
  const del = useDeleteBlockInspection();

  const inspections: any[] = inspData?.inspections ?? [];
  const vendors: any[] = vendorData?.vendors ?? [];

  const handleReject = (id: string) => {
    if (!confirm(`Reject inspection ${id}? This cannot be undone.`)) return;
    reject.mutate(id, {
      onSuccess: () => toast('Inspection rejected', 'success'),
      onError: (e: any) => toast(e.response?.data?.error || 'Failed', 'error'),
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm(`Delete inspection ${id}?`)) return;
    del.mutate(id, {
      onSuccess: () => toast('Deleted', 'success'),
      onError: (e: any) => toast(e.response?.data?.error || 'Failed', 'error'),
    });
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 980, margin: '0 auto' }}>
      {/* ─── Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, flex: 1 }}>Block Inspections</h2>
        <select style={{ ...inp, width: 'auto', fontSize: 12 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="po_raised">PO Raised</option>
          <option value="rejected">Rejected</option>
        </select>
        {canWrite && (
          <button style={btn('#2563eb')} onClick={() => setShowNew(true)}>+ New Inspection</button>
        )}
      </div>

      {/* ─── Table ─── */}
      {isLoading ? (
        <p style={{ color: 'var(--t3)', textAlign: 'center', marginTop: 40 }}>Loading…</p>
      ) : inspections.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--t3)', padding: '60px 0' }}>
          <div style={{ fontSize: 40 }}>◎</div>
          <p style={{ marginTop: 12 }}>No block inspections{statusFilter ? ` with status "${statusFilter}"` : ''}.</p>
          {canWrite && <button style={btn('#2563eb')} onClick={() => setShowNew(true)}>Record First Inspection</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {inspections.map((insp: any) => {
            const gradeMeta = GRADE_COLORS[insp.grade] ?? { color: '#374151', bg: '#f3f4f6' };
            const statusMeta = STATUS_COLORS[insp.status] ?? { color: '#374151', bg: '#f3f4f6' };
            return (
              <div key={insp.id} style={{
                background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 8,
                padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              }}>
                {/* Grade badge */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 800, fontSize: 14,
                  color: gradeMeta.color, background: gradeMeta.bg, flexShrink: 0,
                }}>{insp.grade}</div>

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{insp.id}</div>
                  <div style={{ color: 'var(--t2)', fontSize: 12, marginTop: 2 }}>
                    {insp.variety} · {insp.block_count} block{insp.block_count !== 1 ? 's' : ''} · {insp.est_cft} CFT
                  </div>
                  {insp.vendor_name && <div style={{ color: 'var(--t3)', fontSize: 11, marginTop: 2 }}>{insp.vendor_name}</div>}
                  {insp.quarry_location && <div style={{ color: 'var(--t3)', fontSize: 11 }}>📍 {insp.quarry_location}</div>}
                </div>

                {/* Right side */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, color: statusMeta.color, background: statusMeta.bg }}>
                      {insp.status === 'po_raised' ? 'PO Raised' : insp.status.charAt(0).toUpperCase() + insp.status.slice(1)}
                    </span>
                    {insp.photo_count > 0 && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, color: '#6b21a8', background: '#f5f3ff' }}>
                        📷 {insp.photo_count}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{insp.date}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={btn('#e0e7ff', '#3730a3', '1px solid #c7d2fe')}
                      onClick={() => navigate(`/inspections/${insp.id.replace(/\//g, '~')}`)}>
                      View ↗
                    </button>
                    {canAdmin && insp.status === 'pending' && (
                      <button style={btn('#fee2e2', '#dc2626', '1px solid #fca5a5')}
                        onClick={() => handleReject(insp.id)}>
                        Reject
                      </button>
                    )}
                    {canAdmin && insp.status !== 'po_raised' && (
                      <button style={btn('#f3f4f6', '#374151', '1px solid #d1d5db')}
                        onClick={() => handleDelete(insp.id)}>
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewInspectionModal vendors={vendors} onClose={() => setShowNew(false)} />}
    </div>
  );
}
