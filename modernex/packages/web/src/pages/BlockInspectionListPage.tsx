import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useBlockInspections, useVendors, useCreateBlockInspection,
  useRejectBlockInspection, useDeleteBlockInspection, useAddInspectionPhoto,
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
  'A+': { color: 'var(--sage)',  bg: 'var(--sageW)' },
  'A':  { color: 'var(--blue)',  bg: 'var(--blueW)' },
  'B':  { color: 'var(--amber)', bg: 'var(--amberW)' },
};
const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  pending:   { color: 'var(--amber)', bg: 'var(--amberW)' },
  po_raised: { color: 'var(--sage)',  bg: 'var(--sageW)' },
  rejected:  { color: 'var(--red)',   bg: 'var(--redW)' },
};

// Pre-defined quarry locations (quick-pick)
const QUARRY_LOCATIONS = [
  'Ongole, Andhra Pradesh',
  'Markapur, Andhra Pradesh',
  'Nellore, Andhra Pradesh',
  'Karimnagar, Telangana',
  'Kurnool, Andhra Pradesh',
  'Jalore, Rajasthan',
  'Kishangarh, Rajasthan',
];

// Common defect chips
const DEFECT_CHIPS = ['Cracks', 'Colour variance', 'Iron staining', 'Hollow sound', 'Surface damage', 'Edge chips'];

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
  const [photos, setPhotos] = useState<{ data_url: string; caption: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);    // camera
  const galleryRef = useRef<HTMLInputElement>(null);  // gallery
  const create = useCreateBlockInspection();
  const addPhoto = useAddInspectionPhoto();
  const toast = useToastStore(s => s.notify);
  const set = (k: keyof FormState, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Defect chips — toggling appends/removes from the text
  const toggleDefect = (chip: string) => {
    setForm(f => {
      const current = f.defect_note ? f.defect_note.split(', ').map(s => s.trim()).filter(Boolean) : [];
      const idx = current.indexOf(chip);
      const next = idx >= 0 ? current.filter(c => c !== chip) : [...current, chip];
      return { ...f, defect_note: next.join(', ') };
    });
  };
  const activeDefects = form.defect_note ? form.defect_note.split(', ').map(s => s.trim()).filter(Boolean) : [];

  // Shared file ingest — used by camera, gallery picker, and drag-drop
  const addFiles = (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'));
    if (!images.length) return;
    const room = 10 - photos.length;
    if (room <= 0) { toast('Maximum 10 photos', 'error'); return; }
    images.slice(0, room).forEach(file => {
      if (file.size > 4 * 1024 * 1024) { toast(`${file.name || 'Photo'} is over 4 MB`, 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => setPhotos(p => [...p, { data_url: reader.result as string, caption: '' }]);
      reader.readAsDataURL(file);
    });
  };
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };
  const removePhoto = (idx: number) => setPhotos(p => p.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!form.variety) { toast('Tap a variety first', 'error'); return; }
    setUploading(true);
    try {
      const result: any = await create.mutateAsync(form);
      const inspId = result.inspection.id;
      // Upload all staged photos sequentially
      for (const ph of photos) {
        await addPhoto.mutateAsync({ id: inspId, data_url: ph.data_url, caption: ph.caption || undefined });
      }
      toast('Inspection created', 'success');
      onClose();
    } catch (e: any) {
      toast(e.response?.data?.error || 'Failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── shared chip style helpers
  const chip = (active: boolean, activeColor: string, activeBg: string): React.CSSProperties => ({
    padding: '10px 14px', borderRadius: 8, border: `2px solid ${active ? activeColor : 'var(--bd)'}`,
    background: active ? activeBg : 'var(--bg1)', color: active ? activeColor : 'var(--t2)',
    fontWeight: active ? 700 : 500, cursor: 'pointer', fontSize: 13,
    touchAction: 'manipulation', userSelect: 'none',
  });
  const stepper: React.CSSProperties = {
    width: 44, height: 44, borderRadius: 8, border: '1px solid var(--bd)',
    background: 'var(--bg1)', color: 'var(--t1)', fontSize: 22, fontWeight: 300,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'manipulation',
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000,
      display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ background:'var(--bg0)', borderRadius:'16px 16px 0 0', width:'100%', maxWidth:560,
        maxHeight:'92vh', overflowY:'auto', padding:'20px 18px',
        paddingBottom:'max(20px, env(safe-area-inset-bottom))' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', marginBottom:18 }}>
          <h3 style={{ margin:0, fontSize:17, flex:1 }}>New Block Inspection</h3>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
            style={{ ...inp, width:'auto', fontSize:13, padding:'6px 10px' }} />
        </div>

        {/* ── GRADE ── */}
        <label style={lbl}>Grade *</label>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
          {(['A+','A','B'] as const).map(g => {
            const m = GRADE_COLORS[g]!;
            return (
              <button key={g} type="button" onClick={() => set('grade', g)}
                style={{ ...chip(form.grade === g, m.color, m.bg), fontSize:20, fontWeight:800, padding:'14px 0' }}>
                {g}
              </button>
            );
          })}
        </div>

        {/* ── VARIETY ── */}
        <label style={lbl}>Variety *</label>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
          {VARIETIES.map(v => (
            <button key={v} type="button" onClick={() => set('variety', v)}
              style={chip(form.variety === v, 'var(--blue)', 'var(--blueW)')}>
              {v}
            </button>
          ))}
        </div>

        {/* ── VENDOR ── */}
        {vendors.length > 0 && <>
          <label style={lbl}>Vendor</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
            <button type="button" onClick={() => set('vendor_id', '')}
              style={chip(form.vendor_id === '', 'var(--t3)', 'var(--bg3)')}>
              None
            </button>
            {vendors.map(v => (
              <button key={v.id} type="button" onClick={() => set('vendor_id', v.id)}
                style={chip(form.vendor_id === v.id, 'var(--rust)', 'var(--rustW)')}>
                {v.name}
              </button>
            ))}
          </div>
        </>}

        {/* ── BLOCKS + CFT ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div>
            <label style={lbl}>Blocks *</label>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button type="button" style={stepper} onClick={() => set('block_count', Math.max(1, form.block_count - 1))}>−</button>
              <span style={{ flex:1, textAlign:'center', fontSize:22, fontWeight:700 }}>{form.block_count}</span>
              <button type="button" style={stepper} onClick={() => set('block_count', form.block_count + 1)}>+</button>
            </div>
          </div>
          <div>
            <label style={lbl}>Est. CFT</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:6 }}>
              {[20,30,40,50,60,80,100].map(n => (
                <button key={n} type="button" onClick={() => set('est_cft', n)}
                  style={{ ...chip(form.est_cft === n, 'var(--blue)', 'var(--blueW)'), padding:'6px 10px', fontSize:12 }}>
                  {n}
                </button>
              ))}
            </div>
            <input style={{ ...inp, fontSize:13 }} type="number" min={0} step="0.01"
              placeholder="custom CFT" value={numericInputValue(form.est_cft)}
              onFocus={selectOnFocus} onChange={e => set('est_cft', parseFloat(e.target.value) || 0)} />
          </div>
        </div>

        {/* ── QUARRY LOCATION ── */}
        <label style={lbl}>Quarry Location</label>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
          {QUARRY_LOCATIONS.map(q => (
            <button key={q} type="button" onClick={() => set('quarry_location', q)}
              style={{ ...chip(form.quarry_location === q, 'var(--sage)', 'var(--sageW)'), padding:'7px 11px', fontSize:12 }}>
              {q.split(',')[0]}
            </button>
          ))}
        </div>
        <input style={{ ...inp, marginBottom:16 }} type="text" placeholder="Other location…"
          value={form.quarry_location} onChange={e => set('quarry_location', e.target.value)} />

        {/* ── DEFECTS ── */}
        <label style={lbl}>Defects (tap all that apply)</label>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
          {DEFECT_CHIPS.map(d => (
            <button key={d} type="button" onClick={() => toggleDefect(d)}
              style={{ ...chip(activeDefects.includes(d), 'var(--red)', 'var(--redW)'), padding:'7px 12px', fontSize:12 }}>
              {d}
            </button>
          ))}
        </div>
        {activeDefects.length > 0 && (
          <input style={{ ...inp, marginBottom:16, color:'var(--red)' }} type="text"
            value={form.defect_note} onChange={e => set('defect_note', e.target.value)} />
        )}

        {/* ── NOTES (optional) ── */}
        <label style={lbl}>Notes <span style={{ fontWeight:400, textTransform:'none' }}>(optional)</span></label>
        <textarea style={{ ...inp, height:56, resize:'none', marginBottom:18 }}
          value={form.notes} placeholder="Any other remark…" onChange={e => set('notes', e.target.value)} />

        {/* ── PHOTOS ── */}
        <label style={lbl}>Photos <span style={{ fontWeight:400, textTransform:'none' }}>({photos.length}/10)</span></label>

        {/* Hidden inputs — camera must NOT be `multiple` (mobile browsers ignore
            `capture` when multiple is set, falling back to the gallery picker) */}
        <input ref={photoRef} type="file" accept="image/*" capture="environment"
          style={{ display:'none' }} onChange={handlePhotoCapture} />
        <input ref={galleryRef} type="file" accept="image/*" multiple
          style={{ display:'none' }} onChange={handlePhotoCapture} />

        {/* Tile grid: thumbnails + add-dropzone as the last cell */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(84px, 1fr))', gap:10, marginBottom:18 }}>
          {photos.map((ph, i) => (
            <div key={i} style={{ position:'relative', aspectRatio:'1', borderRadius:10, overflow:'hidden', border:'1px solid var(--bd)' }}>
              <img src={ph.data_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
              {/* gradient + remove */}
              <button type="button" onClick={() => removePhoto(i)} title="Remove" style={{
                position:'absolute', top:5, right:5, width:24, height:24, borderRadius:'50%',
                background:'rgba(0,0,0,0.55)', color:'#fff', border:'none', fontSize:15, lineHeight:1,
                cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(2px)',
              }}>×</button>
              <span style={{ position:'absolute', bottom:4, left:6, fontSize:10, fontWeight:700, color:'#fff', textShadow:'0 1px 2px rgba(0,0,0,0.6)' }}>{i + 1}</span>
            </div>
          ))}

          {/* Add / dropzone tile */}
          {photos.length < 10 && (
            <button type="button"
              onClick={() => galleryRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); }}
              style={{
                aspectRatio:'1', borderRadius:10, cursor:'pointer',
                border:`2px dashed ${dragOver ? 'var(--rust)' : 'var(--bd)'}`,
                background: dragOver ? 'var(--rustW)' : 'var(--bg1)',
                color: dragOver ? 'var(--rust)' : 'var(--t3)',
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3,
                transition:'all 0.15s', touchAction:'manipulation',
              }}>
              <span style={{ fontSize:26, fontWeight:300, lineHeight:1 }}>+</span>
              <span style={{ fontSize:10, fontWeight:600 }}>Add</span>
            </button>
          )}
        </div>

        {/* Camera shortcut — direct capture (mobile) / harmless on desktop */}
        {photos.length < 10 && (
          <button type="button" onClick={() => photoRef.current?.click()}
            style={{ ...btn('transparent', 'var(--t2)', '1px solid var(--bd)'), width:'100%', fontSize:13, padding:'10px 0', marginBottom:18, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <span style={{ fontSize:15 }}>⊙</span> Take a photo
          </button>
        )}

        {/* ── Actions ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10 }}>
          <button type="button" style={btn('var(--bg3)','var(--t2)','1px solid var(--bd)')} onClick={onClose} disabled={uploading}>Cancel</button>
          <button type="button" style={{ ...btn('var(--blue)'), fontSize:15, padding:'13px 0' }}
            onClick={submit} disabled={uploading}>
            {uploading
              ? `Saving${photos.length > 0 ? ` + ${photos.length} photo${photos.length > 1 ? 's' : ''}` : ''}…`
              : `✓ Create${photos.length > 0 ? ` + ${photos.length} ⊙` : ''}`}
          </button>
        </div>
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
          <button style={btn('var(--blue)')} onClick={() => setShowNew(true)}>+ New Inspection</button>
        )}
      </div>

      {/* ─── Table ─── */}
      {isLoading ? (
        <p style={{ color: 'var(--t3)', textAlign: 'center', marginTop: 40 }}>Loading…</p>
      ) : inspections.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--t3)', padding: '60px 0' }}>
          <div style={{ fontSize: 40 }}>◎</div>
          <p style={{ marginTop: 12 }}>No block inspections{statusFilter ? ` with status "${statusFilter}"` : ''}.</p>
          {canWrite && <button style={btn('var(--blue)')} onClick={() => setShowNew(true)}>Record First Inspection</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {inspections.map((insp: any) => {
            const gradeMeta = GRADE_COLORS[insp.grade] ?? { color: 'var(--t2)', bg: 'var(--bg3)' };
            const statusMeta = STATUS_COLORS[insp.status] ?? { color: 'var(--t2)', bg: 'var(--bg3)' };
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
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, color: 'var(--rust)', background: 'var(--rustW)' }}>
                        ⊙ {insp.photo_count}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{insp.date}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={btn('var(--rustW)', 'var(--rust)', '1px solid var(--rustW)')}
                      onClick={() => navigate(`/inspections/${insp.id.replace(/\//g, '~')}`)}>
                      View ↗
                    </button>
                    {canAdmin && insp.status === 'pending' && (
                      <button style={btn('var(--redW)', 'var(--red)', '1px solid var(--redB)')}
                        onClick={() => handleReject(insp.id)}>
                        Reject
                      </button>
                    )}
                    {canAdmin && insp.status !== 'po_raised' && (
                      <button style={btn('var(--bg3)', 'var(--t2)', '1px solid var(--bd)')}
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
