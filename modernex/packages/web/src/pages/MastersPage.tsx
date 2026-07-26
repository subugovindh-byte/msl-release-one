import { useState, useMemo, useRef } from 'react';
import { useCustomers, useVendors, useCreateCustomer, useUpdateCustomer, useCreateVendor, useUpdateVendor, useVarietyMaster, useCreateVariety, useUpdateVarietyById, useDeleteVariety, useBlockPriceMaster, useUpsertBlockPrice, useDeleteBlockPrice, useSlabPriceMaster, useUpsertSlabPrice, useDeleteSlabPrice } from '@/hooks/useApi';
import { useToastStore } from '@/store';
import { formatINR, numericInputValue, selectOnFocus } from '@/utils/format';

type Tab = 'customers' | 'vendors' | 'varieties' | 'block-prices' | 'slab-prices';

const REGIONS = ['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka', 'Rajasthan', 'Other'];
const BLANK_VARIETY = { variety_name: '', region: 'Other', hsn_default: '2516', uom_default: 'sqft', kind_default: 'slab', typical_grades: 'A,A+', notes: '', active: true, sort_order: 0 };

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand',
  'Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
  'Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal',
];

const BLANK_VENDOR = { name: '', gstin: '', state: 'Tamil Nadu', contact: '', type: 'Quarry', msme: false, msme_number: '', contact_person: '', address: '', pincode: '', email: '' };
const BLANK_CUSTOMER = { name: '', gstin: '', state: 'Tamil Nadu', address: '', contact: '', email: '', credit_days: 0 };

function CustomerCard({ customer, onEdit }: { customer: any; onEdit: (c: any) => void }) {
  return (
    <div style={{
      backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '10px',
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--t1)' }}>{customer.name}</div>
          {customer.gstin && <div style={{ fontSize: '12px', color: 'var(--t2)', marginTop: '2px', fontFamily: 'monospace' }}>GST: {customer.gstin}</div>}
        </div>
        <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', backgroundColor: 'var(--bg3)', color: 'var(--t2)', borderRadius: '20px' }}>{customer.state}</span>
      </div>
      {customer.address && <div style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: '1.5' }}>{customer.address}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: 'var(--t2)' }}>
        {customer.contact && <span>📞 {customer.contact}</span>}
        {customer.email && <span>✉ {customer.email}</span>}
        {(customer.credit_days ?? 0) > 0 && <span>Credit: {customer.credit_days}d</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--bd)', marginTop: '2px' }}>
        <span style={{ fontSize: '11px', color: 'var(--t3)' }}>ID: {customer.id}</span>
        <button
          onClick={() => onEdit(customer)}
          style={{ marginLeft: 'auto', padding: '5px 14px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--bd)', borderRadius: '6px', backgroundColor: 'var(--bg1)', color: 'var(--t1)', cursor: 'pointer' }}
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function CustomerForm({
  title, form, setForm, onSubmit, isPending, submitLabel, onCancel,
}: {
  title: string; form: any; setForm: (f: any) => void;
  onSubmit: (e: React.FormEvent) => void; isPending: boolean; submitLabel: string; onCancel: () => void;
}) {
  return (
    <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
      <h3 style={{ marginTop: 0, marginBottom: '16px' }}>{title}</h3>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div><label className="fl">Name *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="fi" /></div>
          <div><label className="fl">GSTIN</label><input type="text" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} maxLength={15} className="fi" /></div>
          <div>
            <label className="fl">State *</label>
            <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} required className="fsel">
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="fl">Contact</label><input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="fi" /></div>
          <div><label className="fl">Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="fi" /></div>
          <div><label className="fl">Credit Days</label><input type="number" value={numericInputValue(form.credit_days)} onChange={(e) => setForm({ ...form, credit_days: parseInt(e.target.value) || 0 })} onFocus={selectOnFocus} min="0" max="180" className="fi" /></div>
          <div style={{ gridColumn: '1 / -1' }}><label className="fl">Address</label><textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className="fi" /></div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" disabled={isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: '4px', cursor: isPending ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
            {isPending ? 'Saving...' : submitLabel}
          </button>
          <button type="button" onClick={onCancel} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function VarietyList({ varieties, loading, onCreate, onUpdate, onDelete, notify }: {
  varieties: any[]; loading: boolean;
  onCreate: (data: any) => Promise<void>;
  onUpdate: (id: string, data: any) => Promise<void>;
  onDelete: (v: any) => void;
  notify: (msg: string, type: 'success' | 'error') => void;
}) {
  const [quickName, setQuickName] = useState('');
  const [quickRegion, setQuickRegion] = useState('Tamil Nadu');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...BLANK_VARIETY });
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<any>(null);

  const REGION_ORDER = ['Tamil Nadu', 'Andhra Pradesh', 'Telangana', 'Karnataka', 'Rajasthan', 'Other'];
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const v of varieties) { const r = v.region || 'Other'; if (!map[r]) map[r] = []; map[r].push(v); }
    return REGION_ORDER.filter(r => (map[r]?.length ?? 0) > 0).map(r => ({ region: r, items: map[r] as any[] }));
  }, [varieties]);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) return;
    setAdding(true);
    try {
      await onCreate({ ...BLANK_VARIETY, variety_name: quickName.trim(), region: quickRegion });
      setQuickName('');
    } catch (err: any) { notify(err.message || 'Failed to add variety', 'error'); }
    finally { setAdding(false); }
  };

  const openEdit = (v: any) => {
    setEditingId(v.id);
    setEditForm({ variety_name: v.variety_name ?? '', region: v.region ?? 'Other', hsn_default: v.hsn_default ?? '2516', uom_default: v.uom_default ?? 'sqft', kind_default: v.kind_default ?? 'slab', typical_grades: v.typical_grades ?? '', notes: v.notes ?? '', active: v.active !== false, sort_order: v.sort_order ?? 0 });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    try { await onUpdate(editingId, editForm); notify('Variety updated', 'success'); setEditingId(null); }
    catch (err: any) { notify(err.message || 'Failed to update variety', 'error'); }
  };

  const handlePhotoClick = (v: any) => { uploadTargetRef.current = v; fileInputRef.current?.click(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const v = uploadTargetRef.current;
    if (!file || !v) return;
    e.target.value = '';
    setUploadingId(v.id);
    const reader = new FileReader();
    reader.onload = async () => {
      try { await onUpdate(v.id, { photo_url: reader.result as string }); notify('Photo updated', 'success'); }
      catch (err: any) { notify(err.message || 'Failed to upload photo', 'error'); }
      finally { setUploadingId(null); }
    };
    reader.readAsDataURL(file);
  };

  const ROW = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--bd)' };
  const BADGE = { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--bg3)', color: 'var(--t2)' } as React.CSSProperties;

  if (loading) return <p style={{ color: 'var(--t3)' }}>Loading varieties…</p>;

  return (
    <div>
      {/* Hidden file input for photo upload */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Quick-add */}
      <form onSubmit={handleQuickAdd} style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input type="text" value={quickName} onChange={e => setQuickName(e.target.value)} placeholder="New variety name…" className="fi" style={{ flex: '1 1 200px' }} required title="Variety name as it appears in POS and inventory" />
        <select value={quickRegion} onChange={e => setQuickRegion(e.target.value)} className="fsel" style={{ minWidth: 150 }} title="Origin region — used for sourcing reports and grouping">
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="submit" disabled={adding} style={{ padding: '8px 18px', background: 'var(--rust)', color: '#fff', border: 'none', borderRadius: 6, cursor: adding ? 'not-allowed' : 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {adding ? 'Adding…' : '+ Add'}
        </button>
      </form>

      {/* Inline edit form */}
      {editingId && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 18, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Edit Variety — {varieties.find(v => v.id === editingId)?.variety_name}</div>
          <form onSubmit={handleEditSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label className="fl" title="Variety name as it appears in POS and inventory">Name *</label><input type="text" value={editForm.variety_name} onChange={e => setEditForm({ ...editForm, variety_name: e.target.value })} required className="fi" /></div>
              <div><label className="fl" title="Origin region — used for sourcing reports and grouping">Region</label>
                <select value={editForm.region} onChange={e => setEditForm({ ...editForm, region: e.target.value })} className="fsel">
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div><label className="fl" title="Harmonised System of Nomenclature code — 2516 is standard for granite, used on invoices">HSN Code</label><input type="text" value={editForm.hsn_default} onChange={e => setEditForm({ ...editForm, hsn_default: e.target.value })} maxLength={8} className="fi" /></div>
              <div><label className="fl" title="Unit of Measure — sqft for slabs, CBM for blocks, kg for chips">Default UOM</label>
                <select value={editForm.uom_default} onChange={e => setEditForm({ ...editForm, uom_default: e.target.value })} className="fsel">
                  {['sqft','cbm','mt','kg','nos'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div><label className="fl" title="Product kind: slab, tile, block, chips, cobble, kerb, etc.">Default Kind</label>
                <select value={editForm.kind_default} onChange={e => setEditForm({ ...editForm, kind_default: e.target.value })} className="fsel">
                  {['slab','tile','block','cts','strip','kerb','cobble','chips','dust','monument'].map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div><label className="fl" title="Comma-separated quality grades — A+ (premium), A (standard), B (seconds)">Typical Grades</label><input type="text" value={editForm.typical_grades} onChange={e => setEditForm({ ...editForm, typical_grades: e.target.value })} placeholder="A,A+,B" className="fi" /></div>
              <div><label className="fl" title="Internal notes about sourcing, quality, or special handling">Notes</label><input type="text" value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} className="fi" /></div>
              <div><label className="fl" title="Display order: lower numbers appear first">Sort Order</label><input type="number" value={editForm.sort_order} onChange={e => setEditForm({ ...editForm, sort_order: parseInt(e.target.value) || 0 })} min="0" className="fi" /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="edit-active" checked={editForm.active} onChange={e => setEditForm({ ...editForm, active: e.target.checked })} />
                <label htmlFor="edit-active" className="fl" style={{ margin: 0, cursor: 'pointer' }} title="Inactive varieties hidden from POS and inventory creation">Active</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ padding: '8px 20px', background: 'var(--rust)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Save</button>
              <button type="button" onClick={() => setEditingId(null)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--bd)', borderRadius: 6, cursor: 'pointer', color: 'var(--t2)' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Grouped list */}
      {varieties.length === 0 ? (
        <p style={{ color: 'var(--t3)' }}>No varieties yet. Add your first variety above.</p>
      ) : (
        grouped.map(({ region, items }) => (
          <div key={region} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 4, borderBottom: '1px solid var(--bd)', marginBottom: 4 }}>
              {region} ({items.length})
            </div>
            {items.map((v) => (
              <div key={v.id} style={ROW}>
                {/* Photo thumbnail */}
                <button onClick={() => handlePhotoClick(v)} title="Click to upload photo" style={{ width: 40, height: 40, borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg3)', cursor: 'pointer', flexShrink: 0, overflow: 'hidden', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {uploadingId === v.id ? (
                    <span style={{ fontSize: 16 }}>⏳</span>
                  ) : v.photo_url ? (
                    <img src={v.photo_url} alt={v.variety_name} style={{ width: 40, height: 40, objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <span style={{ fontSize: 18, opacity: 0.4 }}>📷</span>
                  )}
                </button>
                {/* Name + grades */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.variety_name}</div>
                  {v.typical_grades && <div style={{ fontSize: 11, color: 'var(--t3)' }}>Grades: {v.typical_grades}</div>}
                </div>
                {/* Badges */}
                <span style={BADGE}>HSN {v.hsn_default}</span>
                <span style={BADGE}>{v.uom_default}</span>
                <span style={{ ...BADGE, textTransform: 'capitalize' }}>{v.kind_default}</span>
                {!v.active && <span style={{ ...BADGE, background: 'var(--redW)', color: 'var(--red)' }}>Inactive</span>}
                {/* Actions */}
                <button onClick={() => openEdit(v)} style={{ padding: '3px 10px', fontSize: 11, border: '1px solid var(--bd)', borderRadius: 4, background: 'var(--bg1)', color: 'var(--t1)', cursor: 'pointer', flexShrink: 0 }}>Edit</button>
                <button onClick={() => onDelete(v)} style={{ padding: '3px 8px', fontSize: 13, border: 'none', background: 'transparent', color: 'var(--rust)', cursor: 'pointer', flexShrink: 0 }} title="Delete variety">✕</button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}


function VendorCard({ vendor, onEdit }: { vendor: any; onEdit: (v: any) => void }) {
  const outstanding = vendor.outstanding_paise ?? 0;
  return (
    <div style={{
      backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '10px',
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px',
      position: 'relative', transition: 'box-shadow 0.15s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--t1)', letterSpacing: '0.01em' }}>
            {vendor.name}
          </div>
          {vendor.contact_person && (
            <div style={{ fontSize: '12px', color: 'var(--t2)', marginTop: '2px' }}>{vendor.contact_person}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '11px', fontWeight: 600, padding: '3px 10px',
            backgroundColor: 'var(--bg3)', color: 'var(--t2)', borderRadius: '20px',
          }}>{vendor.type}</span>
          {vendor.msme ? (
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', backgroundColor: 'var(--sageW)', color: 'var(--sage)', borderRadius: '20px' }}>MSME</span>
          ) : null}
        </div>
      </div>

      {/* Address */}
      {(vendor.address || vendor.pincode || vendor.state) && (
        <div style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: '1.5' }}>
          {[vendor.address, vendor.pincode ? `Pincode: ${vendor.pincode}` : null, vendor.state].filter(Boolean).join(' · ')}
        </div>
      )}

      {/* Contact row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: 'var(--t2)' }}>
        {vendor.contact && <span>📞 {vendor.contact}</span>}
        {vendor.email && <span>✉ {vendor.email}</span>}
        {vendor.gstin && <span style={{ fontFamily: 'monospace' }}>GST: {vendor.gstin}</span>}
      </div>

      {/* Footer: POs + outstanding + edit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingTop: '8px', borderTop: '1px solid var(--bd)', marginTop: '2px' }}>
        <span style={{ fontSize: '12px', color: 'var(--t3)' }}>
          {vendor.po_count ?? 0} PO{(vendor.po_count ?? 0) !== 1 ? 's' : ''}
        </span>
        {outstanding > 0 ? (
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--rust)' }}>
            Outstanding: {formatINR(outstanding)}
          </span>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--t3)' }}>No outstanding</span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <span style={{ fontSize: '11px', color: 'var(--t3)', marginRight: '8px' }}>ID: {vendor.id}</span>
          <button
            onClick={() => onEdit(vendor)}
            style={{ padding: '5px 14px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--bd)', borderRadius: '6px', backgroundColor: 'var(--bg1)', color: 'var(--t1)', cursor: 'pointer' }}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function VendorForm({
  title,
  form,
  setForm,
  onSubmit,
  isPending,
  submitLabel,
  onCancel,
}: {
  title: string;
  form: any;
  setForm: (f: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
      <h3 style={{ marginTop: 0, marginBottom: '16px' }}>{title}</h3>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div><label className="fl">Name *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="fi" /></div>
          <div>
            <label className="fl">Type *</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required className="fsel">
              <option value="Quarry">Quarry</option>
              <option value="Broker">Broker</option>
              <option value="Transporter">Transporter</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div><label className="fl">Contact Person</label><input type="text" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} placeholder="e.g. Thiru. Arun K." className="fi" /></div>
          <div><label className="fl">Phone</label><input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="fi" /></div>
          <div><label className="fl">Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="fi" /></div>
          <div><label className="fl">GSTIN</label><input type="text" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} maxLength={15} className="fi" /></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="fl">Address</label>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Door No., Street, Village/Town" className="fi" />
          </div>
          <div>
            <label className="fl">State *</label>
            <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} required className="fsel">
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="fl">PIN Code</label><input type="text" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} maxLength={6} className="fi" /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" id="msme-form" checked={form.msme} onChange={(e) => setForm({ ...form, msme: e.target.checked })} />
            <label htmlFor="msme-form" className="fl" style={{ margin: 0, cursor: 'pointer' }}>MSME Registered</label>
          </div>
          {form.msme && (
            <div><label className="fl">MSME Number</label><input type="text" value={form.msme_number} onChange={(e) => setForm({ ...form, msme_number: e.target.value })} className="fi" /></div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" disabled={isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: '4px', cursor: isPending ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
            {isPending ? 'Saving...' : submitLabel}
          </button>
          <button type="button" onClick={onCancel} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function MastersPage() {
  const [activeTab, setActiveTab] = useState<Tab>('customers');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [showCreateVendor, setShowCreateVendor] = useState(false);
  const [editingVendor, setEditingVendor] = useState<any | null>(null);
  const [vendorType, setVendorType] = useState('');   // '' = all types

  const { data: customersData, isLoading: loadingCustomers } = useCustomers({ q: searchQuery });
  const { data: vendorsData, isLoading: loadingVendors } = useVendors({ q: searchQuery, type: vendorType || undefined });
  const { data: varietiesData, isLoading: loadingVarieties } = useVarietyMaster({ q: activeTab === 'varieties' ? searchQuery : undefined });
  const { data: pricesData } = useBlockPriceMaster();
  const upsertPrice = useUpsertBlockPrice();
  const deletePrice = useDeleteBlockPrice();
  const { data: slabPricesData } = useSlabPriceMaster();
  const upsertSlabPrice = useUpsertSlabPrice();
  const deleteSlabPrice = useDeleteSlabPrice();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer(editingCustomer?.id ?? '');
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor(editingVendor?.id ?? '');
  const createVariety = useCreateVariety();
  const updateVarietyById = useUpdateVarietyById();
  const deleteVariety = useDeleteVariety();
  const { notify } = useToastStore();

  const customers: any[] = customersData?.customers || [];
  const vendors: any[] = (vendorsData as any)?.vendors || [];
  const varieties: any[] = varietiesData?.varieties || [];
  const blockPrices: any[] = pricesData?.prices || [];
  const slabPrices: any[] = slabPricesData?.prices || [];

  const [customerForm, setCustomerForm] = useState({ ...BLANK_CUSTOMER });
  const [editCustomerForm, setEditCustomerForm] = useState({ ...BLANK_CUSTOMER });
  const [vendorForm, setVendorForm] = useState({ ...BLANK_VENDOR });
  const [editForm, setEditForm] = useState({ ...BLANK_VENDOR });

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCustomer.mutateAsync(customerForm);
      notify('Customer created successfully', 'success');
      setShowCreateCustomer(false);
      setCustomerForm({ ...BLANK_CUSTOMER });
    } catch (err: any) {
      notify(err.message || 'Failed to create customer', 'error');
    }
  };

  const handleEditCustomerOpen = (customer: any) => {
    setEditingCustomer(customer);
    setShowCreateCustomer(false);
    setEditCustomerForm({
      name: customer.name ?? '',
      gstin: customer.gstin ?? '',
      state: customer.state ?? 'Tamil Nadu',
      address: customer.address ?? '',
      contact: customer.contact ?? '',
      email: customer.email ?? '',
      credit_days: customer.credit_days ?? 0,
    });
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateCustomer.mutateAsync(editCustomerForm);
      notify('Customer updated successfully', 'success');
      setEditingCustomer(null);
    } catch (err: any) {
      notify(err.message || 'Failed to update customer', 'error');
    }
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createVendor.mutateAsync(vendorForm as any);
      notify('Vendor created successfully', 'success');
      setShowCreateVendor(false);
      setVendorForm({ ...BLANK_VENDOR });
    } catch (err: any) {
      notify(err.message || 'Failed to create vendor', 'error');
    }
  };

  const handleEditOpen = (vendor: any) => {
    setEditingVendor(vendor);
    setShowCreateVendor(false);
    setEditForm({
      name: vendor.name ?? '',
      gstin: vendor.gstin ?? '',
      state: vendor.state ?? 'Tamil Nadu',
      contact: vendor.contact ?? '',
      type: vendor.type ?? 'Quarry',
      msme: !!vendor.msme,
      msme_number: vendor.msme_number ?? '',
      contact_person: vendor.contact_person ?? '',
      address: vendor.address ?? '',
      pincode: vendor.pincode ?? '',
      email: vendor.email ?? '',
    });
  };

  const handleUpdateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateVendor.mutateAsync(editForm as any);
      notify('Vendor updated successfully', 'success');
      setEditingVendor(null);
    } catch (err: any) {
      notify(err.message || 'Failed to update vendor', 'error');
    }
  };

  const handleCreateVariety = async (data: any) => {
    await createVariety.mutateAsync(data);
    notify('Variety added', 'success');
  };

  const handleUpdateVariety = async (id: string, data: any) => {
    await updateVarietyById.mutateAsync({ id, data });
  };

  const handleDeleteVariety = async (v: any) => {
    if (!window.confirm(`Delete "${v.variety_name}"?`)) return;
    try {
      await deleteVariety.mutateAsync(v.id);
      notify('Variety deleted', 'success');
    } catch (err: any) { notify(err.message || 'Cannot delete — variety may be in use', 'error'); }
  };

  // Block prices state
  const [priceForm, setPriceForm] = useState({ variety: '', grade: 'A' as 'A+' | 'A' | 'B', rate_per_cft_paise: 0, notes: '' });
  const handleUpsertPrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!priceForm.variety) { notify('Select a variety', 'error'); return; }
    upsertPrice.mutate(priceForm, {
      onSuccess: () => { notify('Price saved', 'success'); setPriceForm(p => ({ ...p, rate_per_cft_paise: 0, notes: '' })); },
      onError: (err: any) => notify(err.response?.data?.error || 'Save failed', 'error'),
    });
  };
  const handleDeletePrice = (id: number) => {
    if (!window.confirm('Remove this price entry?')) return;
    deletePrice.mutate(id, {
      onSuccess: () => notify('Removed', 'success'),
      onError: (err: any) => notify(err.response?.data?.error || 'Failed', 'error'),
    });
  };

  // Slab (finished-goods selling) prices state
  const [slabForm, setSlabForm] = useState({ variety: '', grade: 'A' as 'A+' | 'A' | 'B', thickness_mm: 20, rate_per_sqft_paise: 0, notes: '' });
  const handleUpsertSlab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slabForm.variety) { notify('Select a variety', 'error'); return; }
    upsertSlabPrice.mutate(slabForm, {
      onSuccess: () => { notify('Slab price saved', 'success'); setSlabForm(p => ({ ...p, rate_per_sqft_paise: 0, notes: '' })); },
      onError: (err: any) => notify(err.response?.data?.error || 'Save failed', 'error'),
    });
  };
  const handleDeleteSlab = (id: number) => {
    if (!window.confirm('Remove this slab price entry?')) return;
    deleteSlabPrice.mutate(id, {
      onSuccess: () => notify('Removed', 'success'),
      onError: (err: any) => notify(err.response?.data?.error || 'Failed', 'error'),
    });
  };



  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ marginBottom: '8px' }}>Masters</h1>
        <p style={{ color: 'var(--t3)', fontSize: '13px', marginBottom: '0' }}>Manage customers and vendors</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid var(--bd)' }}>
        {(['customers', 'vendors', 'varieties', 'block-prices', 'slab-prices'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 24px', border: 'none',
              borderBottom: activeTab === tab ? '3px solid var(--rust)' : '3px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === tab ? 'var(--t1)' : 'var(--t3)',
              fontWeight: activeTab === tab ? 700 : 500,
              cursor: 'pointer', fontSize: '14px', marginBottom: '-2px', transition: 'all 0.2s',
            }}
          >
            {{ customers: `Customers (${customers.length})`, vendors: `Vendors (${vendors.length})`, varieties: `Varieties (${varieties.length})`, 'block-prices': `Block Prices (${blockPrices.length})`, 'slab-prices': `Slab Prices (${slabPrices.length})` }[tab]}
          </button>
        ))}
      </div>

      {/* Search and Actions */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <input
          type="text"
          placeholder={`Search ${activeTab}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="fi"
          style={{ flex: 1 }}
        />
        {activeTab === 'customers' ? (
          <button onClick={() => { setShowCreateCustomer(!showCreateCustomer); setEditingCustomer(null); }} style={{ padding: '10px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap' }}>
            {showCreateCustomer ? 'Cancel' : '+ New Customer'}
          </button>
        ) : activeTab === 'vendors' ? (
          <button
            onClick={() => { setShowCreateVendor(!showCreateVendor); setEditingVendor(null); }}
            style={{ padding: '10px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap' }}
          >
            {showCreateVendor ? 'Cancel' : '+ New Vendor'}
          </button>
        ) : null}
      </div>

      {/* Customer Create Form */}
      {showCreateCustomer && activeTab === 'customers' && (
        <CustomerForm
          title="Create New Customer"
          form={customerForm}
          setForm={setCustomerForm}
          onSubmit={handleCreateCustomer}
          isPending={createCustomer.isPending}
          submitLabel="Create Customer"
          onCancel={() => setShowCreateCustomer(false)}
        />
      )}

      {/* Customer Edit Form */}
      {editingCustomer && activeTab === 'customers' && (
        <CustomerForm
          title={`Edit Customer — ${editingCustomer.name}`}
          form={editCustomerForm}
          setForm={setEditCustomerForm}
          onSubmit={handleUpdateCustomer}
          isPending={updateCustomer.isPending}
          submitLabel="Save Changes"
          onCancel={() => setEditingCustomer(null)}
        />
      )}

      {/* Vendor Create Form */}
      {showCreateVendor && activeTab === 'vendors' && (
        <VendorForm
          title="Create New Vendor"
          form={vendorForm}
          setForm={setVendorForm}
          onSubmit={handleCreateVendor}
          isPending={createVendor.isPending}
          submitLabel="Create Vendor"
          onCancel={() => setShowCreateVendor(false)}
        />
      )}

      {/* Vendor Edit Form */}
      {editingVendor && activeTab === 'vendors' && (
        <VendorForm
          title={`Edit Vendor — ${editingVendor.name}`}
          form={editForm}
          setForm={setEditForm}
          onSubmit={handleUpdateVendor}
          isPending={updateVendor.isPending}
          submitLabel="Save Changes"
          onCancel={() => setEditingVendor(null)}
        />
      )}

      {/* Customer cards */}
      {activeTab === 'customers' && (
        loadingCustomers ? <p style={{ color: 'var(--t3)' }}>Loading customers...</p> :
        customers.length === 0 ? <p style={{ color: 'var(--t3)' }}>No customers found.</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {customers.map((c) => (
              <CustomerCard key={c.id} customer={c} onEdit={handleEditCustomerOpen} />
            ))}
          </div>
        )
      )}

      {/* Vendor type filter */}
      {activeTab === 'vendors' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            { key: '', label: 'All' },
            { key: 'Quarry', label: 'Quarry' },
            { key: 'Broker', label: 'Broker' },
            { key: 'Transporter', label: 'Transporter' },
            { key: 'Other', label: 'Other' },
          ].map(t => (
            <button
              key={t.key || 'all'}
              type="button"
              onClick={() => setVendorType(t.key)}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: vendorType === t.key ? 'var(--rust)' : 'var(--bg2)',
                color: vendorType === t.key ? '#fff' : 'var(--t2)',
                border: `1px solid ${vendorType === t.key ? 'var(--rust)' : 'var(--bd)'}`,
              }}
            >{t.label}</button>
          ))}
        </div>
      )}

      {/* Vendor cards */}
      {activeTab === 'vendors' && (
        loadingVendors ? <p style={{ color: 'var(--t3)' }}>Loading vendors...</p> :
        vendors.length === 0 ? (
          <p style={{ color: 'var(--t3)' }}>
            {vendorType ? `No ${vendorType.toLowerCase()} vendors found. Add one via “New Vendor” and set Type: ${vendorType}.` : 'No vendors found.'}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '16px' }}>
            {vendors.map((v) => (
              <VendorCard key={v.id} vendor={v} onEdit={handleEditOpen} />
            ))}
          </div>
        )
      )}

      {/* Variety List */}
      {activeTab === 'varieties' && (
        <VarietyList
          varieties={varieties}
          loading={loadingVarieties}
          onCreate={handleCreateVariety}
          onUpdate={handleUpdateVariety}
          onDelete={handleDeleteVariety}
          notify={notify}
        />
      )}

      {/* Block Price Master */}
      {activeTab === 'block-prices' && (
        <div>
          <p style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 20 }}>
            Set the standard rate per CBM for each variety × grade combination.
            When raising a PO from an inspection the rate is auto-filled from here — you can still override it at the time of PO creation.
            The rate that ends up on the PO is locked at that moment.
          </p>

          {/* Add / update form */}
          <form onSubmit={handleUpsertPrice} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 24,
            background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ flex: '1 1 160px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Variety *</label>
              <select className="fi" value={priceForm.variety} onChange={e => setPriceForm(p => ({ ...p, variety: e.target.value }))} required>
                <option value="">Select…</option>
                {varieties.map((v: any) => <option key={v.id} value={v.variety_name}>{v.variety_name}</option>)}
              </select>
            </div>
            <div style={{ flex: '0 0 90px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Grade *</label>
              <select className="fi" value={priceForm.grade} onChange={e => setPriceForm(p => ({ ...p, grade: e.target.value as any }))}>
                <option value="A+">A+</option>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Rate / CBM (₹) *</label>
              <input className="fi" type="number" min={0} step="0.01"
                value={numericInputValue(priceForm.rate_per_cft_paise / 100)}
                onFocus={selectOnFocus}
                onChange={e => setPriceForm(p => ({ ...p, rate_per_cft_paise: Math.round((parseFloat(e.target.value) || 0) * 100) }))} />
            </div>
            <div style={{ flex: '2 1 200px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Notes</label>
              <input className="fi" type="text" placeholder="e.g. revised after market survey" value={priceForm.notes}
                onChange={e => setPriceForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <button type="submit" style={{ padding: '9px 20px', background: 'var(--rust)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
              disabled={upsertPrice.isPending}>
              {upsertPrice.isPending ? 'Saving…' : 'Save Price'}
            </button>
          </form>

          {/* Price table */}
          {blockPrices.length === 0 ? (
            <p style={{ color: 'var(--t3)', textAlign: 'center', padding: '40px 0' }}>No prices set yet. Add the first one above.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--bd)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', color: 'var(--t3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Variety</th>
                  <th style={{ padding: '8px 12px', color: 'var(--t3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Grade</th>
                  <th style={{ padding: '8px 12px', color: 'var(--t3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Rate / CBM</th>
                  <th style={{ padding: '8px 12px', color: 'var(--t3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Notes</th>
                  <th style={{ padding: '8px 12px', color: 'var(--t3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Updated</th>
                  <th style={{ padding: '8px 4px' }}></th>
                </tr>
              </thead>
              <tbody>
                {blockPrices.map((p: any) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.variety}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                        color: p.grade === 'A+' ? 'var(--sage)' : p.grade === 'A' ? 'var(--blue)' : 'var(--amber)',
                        background: p.grade === 'A+' ? 'var(--sageW)' : p.grade === 'A' ? 'var(--blueW)' : 'var(--amberW)' }}>
                        {p.grade}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{formatINR(p.rate_per_cft_paise)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--t3)' }}>{p.notes ?? '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--t3)', fontSize: 12 }}>{p.updated_at?.slice(0, 16).replace('T', ' ')}</td>
                    <td style={{ padding: '10px 4px' }}>
                      <button
                        onClick={() => setPriceForm({ variety: p.variety, grade: p.grade, rate_per_cft_paise: p.rate_per_cft_paise, notes: p.notes ?? '' })}
                        style={{ padding: '4px 10px', fontSize: 12, background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 5, cursor: 'pointer', marginRight: 6 }}>
                        Edit
                      </button>
                      <button onClick={() => handleDeletePrice(p.id)}
                        style={{ padding: '4px 10px', fontSize: 12, background: 'var(--redW)', color: 'var(--red)', border: '1px solid var(--redW)', borderRadius: 5, cursor: 'pointer' }}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Slab Price Master (finished-goods selling price) */}
      {activeTab === 'slab-prices' && (
        <div>
          <p style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 20 }}>
            Set the standard <strong>selling</strong> rate per sq.ft for each variety × grade × thickness.
            Producing a slab auto-fills its rate from here — you can still override it at production and per-line at POS.
          </p>

          {/* Add / update form */}
          <form onSubmit={handleUpsertSlab} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 24,
            background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ flex: '1 1 150px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Variety *</label>
              <select className="fi" value={slabForm.variety} onChange={e => setSlabForm(p => ({ ...p, variety: e.target.value }))} required>
                <option value="">Select…</option>
                {varieties.map((v: any) => <option key={v.id} value={v.variety_name}>{v.variety_name}</option>)}
              </select>
            </div>
            <div style={{ flex: '0 0 80px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Grade *</label>
              <select className="fi" value={slabForm.grade} onChange={e => setSlabForm(p => ({ ...p, grade: e.target.value as any }))}>
                <option value="A+">A+</option><option value="A">A</option><option value="B">B</option>
              </select>
            </div>
            <div style={{ flex: '0 0 110px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Thickness (mm)</label>
              <input className="fi" list="slab-thk" type="number" min={0} step="1" value={numericInputValue(slabForm.thickness_mm)}
                onFocus={selectOnFocus} onChange={e => setSlabForm(p => ({ ...p, thickness_mm: parseInt(e.target.value) || 0 }))} />
              <datalist id="slab-thk">{[18, 20, 30, 40, 50].map(t => <option key={t} value={t} />)}</datalist>
            </div>
            <div style={{ flex: '1 1 130px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Rate / sq.ft (₹) *</label>
              <input className="fi" type="number" min={0} step="0.01"
                value={numericInputValue(slabForm.rate_per_sqft_paise / 100)}
                onFocus={selectOnFocus}
                onChange={e => setSlabForm(p => ({ ...p, rate_per_sqft_paise: Math.round((parseFloat(e.target.value) || 0) * 100) }))} />
            </div>
            <div style={{ flex: '2 1 180px' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Notes</label>
              <input className="fi" type="text" placeholder="e.g. export grade" value={slabForm.notes}
                onChange={e => setSlabForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <button type="submit" style={{ padding: '9px 20px', background: 'var(--rust)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
              disabled={upsertSlabPrice.isPending}>
              {upsertSlabPrice.isPending ? 'Saving…' : 'Save Price'}
            </button>
          </form>

          {/* Price table */}
          {slabPrices.length === 0 ? (
            <p style={{ color: 'var(--t3)', textAlign: 'center', padding: '40px 0' }}>No slab prices set yet. Add the first one above.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--bd)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', color: 'var(--t3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Variety</th>
                  <th style={{ padding: '8px 12px', color: 'var(--t3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Grade</th>
                  <th style={{ padding: '8px 12px', color: 'var(--t3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Thickness</th>
                  <th style={{ padding: '8px 12px', color: 'var(--t3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', textAlign: 'right' }}>Rate / sq.ft</th>
                  <th style={{ padding: '8px 12px', color: 'var(--t3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Notes</th>
                  <th style={{ padding: '8px 4px' }}></th>
                </tr>
              </thead>
              <tbody>
                {slabPrices.map((p: any) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.variety}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                        color: p.grade === 'A+' ? 'var(--sage)' : p.grade === 'A' ? 'var(--blue)' : 'var(--amber)',
                        background: p.grade === 'A+' ? 'var(--sageW)' : p.grade === 'A' ? 'var(--blueW)' : 'var(--amberW)' }}>
                        {p.grade}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{p.thickness_mm ? `${p.thickness_mm} mm` : '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{formatINR(p.rate_per_sqft_paise)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--t3)' }}>{p.notes ?? '—'}</td>
                    <td style={{ padding: '10px 4px', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => setSlabForm({ variety: p.variety, grade: p.grade, thickness_mm: p.thickness_mm, rate_per_sqft_paise: p.rate_per_sqft_paise, notes: p.notes ?? '' })}
                        style={{ padding: '4px 10px', fontSize: 12, background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 5, cursor: 'pointer', marginRight: 6 }}>
                        Edit
                      </button>
                      <button onClick={() => handleDeleteSlab(p.id)} title="Remove"
                        style={{ padding: '4px 10px', fontSize: 12, background: 'var(--redW)', color: 'var(--red)', border: '1px solid var(--redW)', borderRadius: 5, cursor: 'pointer' }}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
