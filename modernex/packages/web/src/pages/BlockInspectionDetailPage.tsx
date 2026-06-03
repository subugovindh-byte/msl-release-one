import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  useBlockInspection, useBlockInspectionPhoto,
  useUpdateBlockInspection, useRejectBlockInspection,
  useAddInspectionPhoto, useDeleteInspectionPhoto,
  useRaiseInspectionPO, useVendors, useBlockPriceMaster,
} from '@/hooks/useApi';
import { formatINR, numericInputValue, selectOnFocus } from '@/utils/format';
import { GST_RATE, GST_RATE_LABEL, VARIETIES } from '@modernex/shared';
import { useToastStore, useAuthStore } from '@/store';

// ── Tiny style helpers ────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 6,
  color: 'var(--t1)', fontSize: 15, padding: '10px 12px', width: '100%', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: '0.05em', display: 'block', marginBottom: 5,
};
const btn = (bg: string, color = '#fff', border = 'none'): React.CSSProperties => ({
  padding: '11px 20px', background: bg, color, border, borderRadius: 8,
  fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'center',
  touchAction: 'manipulation',
});
const card: React.CSSProperties = {
  background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: '16px',
};

const GRADE_COLORS: Record<string, { color: string; bg: string }> = {
  'A+': { color: '#15803d', bg: '#dcfce7' },
  'A':  { color: '#1d4ed8', bg: '#dbeafe' },
  'B':  { color: '#92400e', bg: '#fef9c3' },
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', po_raised: 'PO Raised', rejected: 'Rejected',
};

// ── Photo thumbnail component (loads data_url lazily) ────────────────────────
function PhotoThumb({ inspId, photoId, caption, canDelete, onDelete }:
  { inspId: string; photoId: number; caption: string | null; canDelete: boolean; onDelete: () => void }) {
  const [show, setShow] = useState(false);
  const { data } = useBlockInspectionPhoto(inspId, show ? photoId : null);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', background: 'var(--bg2)', cursor: 'pointer',
          border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setShow(s => !s)}>
        {show && data?.photo?.data_url
          ? <img src={data.photo.data_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={caption ?? ''} />
          : <span style={{ fontSize: 28 }}>🖼️</span>}
      </div>
      {canDelete && (
        <button onClick={onDelete} style={{
          position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
          background: '#ef4444', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}>×</button>
      )}
      {caption && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3, maxWidth: 80, wordBreak: 'break-all' }}>{caption}</div>}
    </div>
  );
}

// ── Raise-PO modal ────────────────────────────────────────────────────────────
function RaisePOModal({ insp, onClose }: { insp: any; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToastStore(s => s.notify);
  const { data: pricesData } = useBlockPriceMaster();

  // Auto-fill rate from master (variety + grade match)
  const masterRate: number = (() => {
    const prices: any[] = pricesData?.prices ?? [];
    const match = prices.find((p: any) => p.variety === insp.variety && p.grade === insp.grade);
    return match?.rate_per_cft_paise ?? 0;
  })();

  const [rate, setRate] = useState(masterRate);
  const [transport, setTransport] = useState(0);
  const [notes, setNotes] = useState(insp.notes ?? '');
  const [date, setDate] = useState(insp.date);
  const raise = useRaiseInspectionPO();

  // Update rate when master data loads (only if user hasn't touched it)
  const [userEditedRate, setUserEditedRate] = useState(false);
  if (!userEditedRate && masterRate > 0 && rate === 0) setRate(masterRate);

  const cft = insp.est_cft ?? 0;
  const taxable = Math.round(cft * rate) + (transport || 0);
  const gst = Math.round(taxable * GST_RATE);
  const total = taxable + gst;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rate) { toast('Enter rate per CFT', 'error'); return; }
    raise.mutate(
      { id: insp.id, rate_per_cft_paise: rate, transport_paise: transport, notes, date },
      {
        onSuccess: (d: any) => {
          toast(`PO ${d.po.id} created`, 'success');
          navigate('/purchase');
        },
        onError: (e: any) => toast(e.response?.data?.error || 'Failed', 'error'),
      }
    );
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ background:'var(--bg0)', borderRadius:'16px 16px 0 0', padding:'24px 20px', width:'100%', maxWidth:540, paddingBottom:'env(safe-area-inset-bottom, 16px)' }}>
        <h3 style={{ margin:'0 0 4px', fontSize:18 }}>Raise Purchase Order</h3>
        <p style={{ margin:'0 0 16px', color:'var(--t2)', fontSize:13 }}>{insp.variety} · {insp.block_count} blocks · {cft} CFT · Grade {insp.grade}</p>
        <form onSubmit={submit}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div><label style={lbl}>PO Date</label>
              <input style={inp} type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label style={lbl}>Rate/CFT (₹)</label>
              <input style={inp} type="number" min={0} step="0.01" value={rate ? rate/100 : ''} placeholder="0.00"
                onFocus={selectOnFocus}
                onChange={e => { setUserEditedRate(true); setRate(Math.round(parseFloat(e.target.value || '0') * 100)); }} />
              {masterRate > 0 && (
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>
                  Master price: {formatINR(masterRate)}/CFT
                  {userEditedRate && rate !== masterRate && (
                    <button type="button" onClick={() => { setRate(masterRate); setUserEditedRate(false); }}
                      style={{ marginLeft: 6, fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      ↺ restore
                    </button>
                  )}
                </div>
              )}
            </div>
            <div><label style={lbl}>Transport (₹)</label>
              <input style={inp} type="number" min={0} step="0.01" value={transport ? transport/100 : ''} placeholder="0.00"
                onFocus={selectOnFocus}
                onChange={e => setTransport(Math.round(parseFloat(e.target.value || '0') * 100))} /></div>
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
              <div style={{ fontSize:12, color:'var(--t3)' }}>Taxable: {formatINR(taxable)}</div>
              <div style={{ fontSize:12, color:'var(--t3)' }}>GST ({GST_RATE_LABEL}): {formatINR(gst)}</div>
              <div style={{ fontSize:14, fontWeight:700 }}>Total: {formatINR(total)}</div>
            </div>
          </div>
          <div style={{ marginTop:12 }}><label style={lbl}>Notes</label>
            <textarea style={{ ...inp, height:64, resize:'none' }} value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div style={{ display:'flex', gap:10, marginTop:18 }}>
            <button type="button" style={{ ...btn('#f3f4f6','#374151','1px solid #d1d5db'), flex:1 }} onClick={onClose}>Cancel</button>
            <button type="submit" style={{ ...btn('#16a34a'), flex:2 }} disabled={raise.isPending}>
              {raise.isPending ? 'Creating PO…' : '✓ Create PO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BlockInspectionDetailPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = (rawId ?? '').replace(/~/g, '/');
  const navigate = useNavigate();
  const toast = useToastStore(s => s.notify);
  const role = useAuthStore(s => s.user?.role);
  const canWrite = role === 'admin' || role === 'accounts' || role === 'yard';
  const canAdmin = role === 'admin' || role === 'accounts';

  const { data, isLoading, isError } = useBlockInspection(id);
  const { data: vendorData } = useVendors();
  const updateInsp = useUpdateBlockInspection();
  const addPhoto = useAddInspectionPhoto();
  const delPhoto = useDeleteInspectionPhoto();
  const rejectInsp = useRejectBlockInspection();

  const [editing, setEditing] = useState(false);
  const [showRaisePO, setShowRaisePO] = useState(false);
  const [captionInput, setCaptionInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const insp: any = data?.inspection;
  const photos: any[] = data?.photos ?? [];
  const vendors: any[] = vendorData?.vendors ?? [];

  // Edit form state (kept in sync when we start editing)
  const [editForm, setEditForm] = useState<any>({});
  const startEdit = () => {
    setEditForm({
      variety: insp.variety, block_count: insp.block_count, est_cft: insp.est_cft,
      grade: insp.grade, defect_note: insp.defect_note ?? '', notes: insp.notes ?? '',
      quarry_location: insp.quarry_location ?? '', vendor_id: insp.vendor_id ?? '', date: insp.date,
    });
    setEditing(true);
  };
  const saveEdit = () => {
    updateInsp.mutate(
      { id, ...editForm },
      {
        onSuccess: () => { toast('Saved', 'success'); setEditing(false); },
        onError: (e: any) => toast(e.response?.data?.error || 'Save failed', 'error'),
      }
    );
  };

  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast('Photo must be < 4 MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      addPhoto.mutate(
        { id, data_url: reader.result as string, caption: captionInput || undefined },
        {
          onSuccess: () => { toast('Photo uploaded', 'success'); setCaptionInput(''); if (fileRef.current) fileRef.current.value = ''; },
          onError: (e: any) => toast(e.response?.data?.error || 'Upload failed', 'error'),
        }
      );
    };
    reader.readAsDataURL(file);
  };

  const handleReject = () => {
    if (!confirm(`Reject inspection ${id}?`)) return;
    rejectInsp.mutate(id, {
      onSuccess: () => { toast('Rejected', 'success'); navigate('/inspections'); },
      onError: (e: any) => toast(e.response?.data?.error || 'Failed', 'error'),
    });
  };

  if (isLoading) return <p style={{ padding: 24, color: 'var(--t3)' }}>Loading…</p>;
  if (isError || !insp) return <p style={{ padding: 24, color: '#dc2626' }}>Inspection not found.</p>;

  const gradeMeta = GRADE_COLORS[insp.grade] ?? { color: '#374151', bg: '#f3f4f6' };
  const isPending = insp.status === 'pending';

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px', paddingBottom: 120 }}>
      {/* ─── Back link ─── */}
      <Link to="/inspections" style={{ fontSize: 13, color: 'var(--t2)', textDecoration: 'none' }}>← Block Inspections</Link>

      {/* ─── Header card ─── */}
      <div style={{ ...card, marginTop: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontWeight: 900, fontSize: 18,
          color: gradeMeta.color, background: gradeMeta.bg, flexShrink: 0,
        }}>{insp.grade}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{insp.id}</div>
          <div style={{ color: 'var(--t2)', fontSize: 13, marginTop: 2 }}>
            {insp.variety} · {insp.block_count} block{insp.block_count !== 1 ? 's' : ''} · {insp.est_cft} CFT
          </div>
          {insp.vendor_name && <div style={{ color: 'var(--t3)', fontSize: 12 }}>{insp.vendor_name}</div>}
        </div>
        <div>
          <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 700,
            background: insp.status === 'po_raised' ? '#dcfce7' : insp.status === 'rejected' ? '#fee2e2' : '#fef9c3',
            color: insp.status === 'po_raised' ? '#15803d' : insp.status === 'rejected' ? '#dc2626' : '#92400e' }}>
            {STATUS_LABELS[insp.status] ?? insp.status}
          </span>
          {insp.po_id && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--t3)' }}>
              PO: <Link to={`/purchase/${insp.po_id.replace(/\//g, '~')}`} style={{ color: '#2563eb' }}>{insp.po_id}</Link>
            </div>
          )}
        </div>
      </div>

      {/* ─── Details / Edit ─── */}
      <div style={{ ...card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, flex: 1 }}>Details</h3>
          {canWrite && isPending && !editing && (
            <button style={btn('#f3f4f6','#374151','1px solid #d1d5db')} onClick={startEdit}>Edit</button>
          )}
        </div>
        {editing ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Date</label>
                <input style={inp} type="date" value={editForm.date} onChange={e => setEditForm((f: any) => ({ ...f, date: e.target.value }))} /></div>
              <div><label style={lbl}>Grade</label>
                <select style={inp} value={editForm.grade} onChange={e => setEditForm((f: any) => ({ ...f, grade: e.target.value }))}>
                  <option value="A+">A+</option><option value="A">A</option><option value="B">B</option>
                </select></div>
              <div><label style={lbl}>Vendor</label>
                <select style={inp} value={editForm.vendor_id} onChange={e => setEditForm((f: any) => ({ ...f, vendor_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select></div>
              <div><label style={lbl}>Variety</label>
                <select style={inp} value={editForm.variety} onChange={e => setEditForm((f: any) => ({ ...f, variety: e.target.value }))}>
                  {VARIETIES.map((v: string) => <option key={v} value={v}>{v}</option>)}
                </select></div>
              <div><label style={lbl}>Blocks</label>
                <input style={inp} type="number" min={1} value={numericInputValue(editForm.block_count, false)}
                  onFocus={selectOnFocus} onChange={e => setEditForm((f: any) => ({ ...f, block_count: parseInt(e.target.value) || 1 }))} /></div>
              <div><label style={lbl}>Est. CFT</label>
                <input style={inp} type="number" min={0} step="0.01" value={numericInputValue(editForm.est_cft)}
                  onFocus={selectOnFocus} onChange={e => setEditForm((f: any) => ({ ...f, est_cft: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div><label style={lbl}>Quarry Location</label>
              <input style={inp} type="text" value={editForm.quarry_location} onChange={e => setEditForm((f: any) => ({ ...f, quarry_location: e.target.value }))} /></div>
            <div><label style={lbl}>Defect Note</label>
              <textarea style={{ ...inp, height: 64, resize: 'none' }} value={editForm.defect_note} onChange={e => setEditForm((f: any) => ({ ...f, defect_note: e.target.value }))} /></div>
            <div><label style={lbl}>Notes</label>
              <textarea style={{ ...inp, height: 64, resize: 'none' }} value={editForm.notes} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...btn('#f3f4f6','#374151','1px solid #d1d5db'), flex: 1 }} onClick={() => setEditing(false)}>Cancel</button>
              <button style={{ ...btn('#2563eb'), flex: 2 }} onClick={saveEdit} disabled={updateInsp.isPending}>
                {updateInsp.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
            <div><span style={{ color: 'var(--t3)' }}>Date</span><br /><strong>{insp.date}</strong></div>
            <div><span style={{ color: 'var(--t3)' }}>Inspected by</span><br /><strong>{insp.inspected_by}</strong></div>
            <div><span style={{ color: 'var(--t3)' }}>Variety</span><br /><strong>{insp.variety}</strong></div>
            <div><span style={{ color: 'var(--t3)' }}>Grade</span><br />
              <strong style={{ color: gradeMeta.color }}>{insp.grade}</strong></div>
            <div><span style={{ color: 'var(--t3)' }}>Blocks</span><br /><strong>{insp.block_count}</strong></div>
            <div><span style={{ color: 'var(--t3)' }}>Est. CFT</span><br /><strong>{insp.est_cft}</strong></div>
            {insp.quarry_location && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--t3)' }}>Quarry</span><br /><strong>{insp.quarry_location}</strong></div>}
            {insp.defect_note && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--t3)' }}>Defect note</span><br /><strong style={{ color: '#92400e' }}>{insp.defect_note}</strong></div>}
            {insp.notes && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--t3)' }}>Notes</span><br /><strong>{insp.notes}</strong></div>}
          </div>
        )}
      </div>

      {/* ─── Photos ─── */}
      <div style={{ ...card, marginTop: 12 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Photos ({photos.length}/10)</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {photos.map((p: any) => (
            <PhotoThumb
              key={p.id} inspId={id} photoId={p.id} caption={p.caption}
              canDelete={canWrite && isPending}
              onDelete={() => delPhoto.mutate({ id, photoId: p.id }, {
                onError: (e: any) => toast(e.response?.data?.error || 'Delete failed', 'error'),
              })}
            />
          ))}
        </div>
        {canWrite && isPending && photos.length < 10 && (
          <div style={{ marginTop: 14 }}>
            <input
              style={{ ...inp, fontSize: 13, marginBottom: 8 }}
              type="text" placeholder="Caption (optional)" value={captionInput}
              onChange={e => setCaptionInput(e.target.value)}
            />
            {/* Camera-first file input for mobile */}
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }} onChange={handlePhotoFile} />
            <button style={{ ...btn('#7c3aed'), width: '100%' }} onClick={() => fileRef.current?.click()}
              disabled={addPhoto.isPending}>
              {addPhoto.isPending ? 'Uploading…' : '📷 Add Photo'}
            </button>
          </div>
        )}
      </div>

      {/* ─── Action buttons ─── */}
      {isPending && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          background: 'var(--bg0)', borderTop: '1px solid var(--bd)', display: 'flex', gap: 10, maxWidth: 600, margin: '0 auto' }}>
          {canAdmin && (
            <button style={{ ...btn('#fee2e2','#dc2626','1px solid #fca5a5'), flex: 1 }} onClick={handleReject}>
              ✕ Reject
            </button>
          )}
          {canAdmin && (
            <button style={{ ...btn('#16a34a'), flex: 2, fontSize: 15 }} onClick={() => setShowRaisePO(true)}>
              ✓ Raise PO
            </button>
          )}
        </div>
      )}

      {showRaisePO && <RaisePOModal insp={insp} onClose={() => setShowRaisePO(false)} />}
    </div>
  );
}
