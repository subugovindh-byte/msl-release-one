import { useState } from 'react';
import { useFixedAssets, useCreateFixedAsset, useUpdateFixedAsset, useDisposeAsset, useRunDepreciation, useVendors } from '@/hooks/useApi';
import { formatINR, numericInputValue, selectOnFocus } from '@/utils/format';
import { useToastStore } from '@/store';

const CATEGORIES = ['Plant & Machinery', 'Vehicles', 'Land & Building', 'Furniture & Fixtures', 'Computer & Peripherals', 'Other'];
const DEP_RATES: Record<string, number> = {
  'Plant & Machinery': 15, 'Vehicles': 15, 'Land & Building': 5,
  'Furniture & Fixtures': 10, 'Computer & Peripherals': 40, 'Other': 15,
};
const BLANK = { name: '', category: 'Plant & Machinery', purchase_date: new Date().toISOString().slice(0, 10), purchase_cost_paise: 0, description: '', vendor_id: '', location: '', serial_no: '', depreciation_method: 'WDV', depreciation_rate_pct: 15, account_id: '' };

export function FixedAssetsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [editForm, setEditForm] = useState({ name: '', category: '', description: '', location: '', serial_no: '' });
  const [showDepreciation, setShowDepreciation] = useState(false);
  const [depFy, setDepFy] = useState('2025-26');
  const [disposeId, setDisposeId] = useState<string | null>(null);
  const [disposeForm, setDisposeForm] = useState({ disposal_date: new Date().toISOString().slice(0, 10), disposal_value_paise: 0 });
  const { notify } = useToastStore();

  const { data: assetsData, isLoading } = useFixedAssets({});
  const { data: vendorsData } = useVendors({});
  const createAsset = useCreateFixedAsset();
  const updateAsset = useUpdateFixedAsset(editingId || '');
  const disposeAsset = useDisposeAsset(disposeId || '');
  const runDepr = useRunDepreciation();

  const assets: any[] = assetsData?.assets || [];
  const vendors: any[] = (vendorsData as any)?.vendors || [];

  const totalCost = assets.reduce((s, a) => s + a.purchase_cost_paise, 0);
  const totalWdv  = assets.reduce((s, a) => s + (a.current_wdv_paise ?? a.purchase_cost_paise), 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAsset.mutateAsync({ ...form, purchase_cost_paise: Math.round(form.purchase_cost_paise * 100) });
      notify('Asset added', 'success');
      setShowCreate(false);
      setForm({ ...BLANK });
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateAsset.mutateAsync(editForm);
      notify('Asset updated', 'success');
      setEditingId(null);
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleDispose = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await disposeAsset.mutateAsync({ ...disposeForm, disposal_value_paise: Math.round(disposeForm.disposal_value_paise * 100) });
      notify('Asset disposed', 'success');
      setDisposeId(null);
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleRunDepr = async () => {
    if (!window.confirm(`Run WDV depreciation for FY ${depFy}? This will update all active assets.`)) return;
    try {
      const result = await runDepr.mutateAsync({ fy: depFy }) as any;
      notify(`Depreciation computed for ${result.computed} assets`, 'success');
      setShowDepreciation(false);
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>Fixed Asset Register</h1>
        <p style={{ color: 'var(--t3)', fontSize: 13, margin: 0 }}>WDV / SLM depreciation per Income Tax Act Schedule II</p>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Assets', value: String(assets.length), sub: 'active' },
          { label: 'Gross Block', value: formatINR(totalCost), sub: 'purchase cost' },
          { label: 'Net Block (WDV)', value: formatINR(totalWdv), sub: 'after depreciation' },
        ].map((c) => (
          <div key={c.label} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{c.value}</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={() => setShowCreate(!showCreate)} style={{ padding: '9px 18px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
          {showCreate ? 'Cancel' : '+ Add Asset'}
        </button>
        <button onClick={() => setShowDepreciation(!showDepreciation)} style={{ padding: '9px 16px', backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, color: 'var(--t1)' }}>
          Run Depreciation
        </button>
      </div>

      {showDepreciation && (
        <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--amberB)', borderRadius: 8, padding: 16, marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label className="fl">Financial Year</label>
            <select value={depFy} onChange={(e) => setDepFy(e.target.value)} className="fsel">
              {['2024-25', '2025-26', '2026-27'].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <button onClick={handleRunDepr} disabled={runDepr.isPending} style={{ padding: '9px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
            {runDepr.isPending ? 'Running...' : `Compute WDV for ${depFy}`}
          </button>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Add Fixed Asset</h3>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}><label className="fl">Asset Name *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="fi" placeholder="e.g. Gang Saw Machine — Unit 2" /></div>
              <div>
                <label className="fl">Category *</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, depreciation_rate_pct: DEP_RATES[e.target.value] || 15 })} className="fsel">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="fl">Purchase Date *</label><input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} required className="fi" /></div>
              <div>
                <label className="fl">Purchase Cost (₹) *</label>
                <input type="number" step="0.01" value={numericInputValue(form.purchase_cost_paise)} onChange={(e) => setForm({ ...form, purchase_cost_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} required className="fi" />
              </div>
              <div>
                <label className="fl">Depreciation Method</label>
                <select value={form.depreciation_method} onChange={(e) => setForm({ ...form, depreciation_method: e.target.value })} className="fsel">
                  <option value="WDV">WDV (Written Down Value)</option>
                  <option value="SLM">SLM (Straight Line)</option>
                </select>
              </div>
              <div>
                <label className="fl">Depreciation Rate %</label>
                <input type="number" step="0.01" value={form.depreciation_rate_pct} onChange={(e) => setForm({ ...form, depreciation_rate_pct: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} className="fi" />
              </div>
              <div><label className="fl">Vendor / Supplier</label>
                <select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} className="fsel">
                  <option value="">— Select vendor —</option>
                  {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div><label className="fl">Location</label><input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="fi" placeholder="e.g. Processing Unit 1" /></div>
              <div><label className="fl">Serial No / Tag</label><input type="text" value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} className="fi" /></div>
              <div style={{ gridColumn: '1 / -1' }}><label className="fl">Description</label><input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="fi" /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={createAsset.isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                {createAsset.isPending ? 'Adding...' : 'Add Asset'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Dispose form */}
      {disposeId && (
        <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h4 style={{ margin: '0 0 12px' }}>Dispose Asset — {disposeId}</h4>
          <form onSubmit={handleDispose} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><label className="fl">Disposal Date *</label><input type="date" value={disposeForm.disposal_date} onChange={(e) => setDisposeForm({ ...disposeForm, disposal_date: e.target.value })} required className="fi" /></div>
            <div><label className="fl">Sale / Scrap Value (₹)</label><input type="number" step="0.01" value={numericInputValue(disposeForm.disposal_value_paise)} onChange={(e) => setDisposeForm({ ...disposeForm, disposal_value_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} className="fi" /></div>
            <button type="submit" style={{ padding: '9px 18px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Confirm Disposal</button>
            <button type="button" onClick={() => setDisposeId(null)} style={{ padding: '9px 14px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
          </form>
        </div>
      )}

      {/* Asset List */}
      {isLoading ? <p style={{ color: 'var(--t3)' }}>Loading assets...</p> :
       assets.length === 0 ? <p style={{ color: 'var(--t3)' }}>No assets recorded. Add your first fixed asset above.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {assets.map((a: any) => (
            <div key={a.id} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '16px 20px' }}>
              {editingId === a.id ? (
                <form onSubmit={handleUpdate}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div><label className="fl">Name</label><input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="fi" /></div>
                    <div><label className="fl">Location</label><input type="text" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} className="fi" /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label className="fl">Description</label><input type="text" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="fi" /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="submit" style={{ padding: '7px 18px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)} style={{ padding: '7px 14px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>{a.category}{a.location ? ` · ${a.location}` : ''}{a.serial_no ? ` · S/N: ${a.serial_no}` : ''}</div>
                    {a.description && <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{a.description}</div>}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 160 }}>
                    <div style={{ fontSize: 12, color: 'var(--t3)' }}>Cost: {formatINR(a.purchase_cost_paise)}</div>
                    <div style={{ fontWeight: 700, color: 'var(--rust)' }}>WDV: {formatINR(a.current_wdv_paise ?? a.purchase_cost_paise)}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{a.depreciation_method} @ {a.depreciation_rate_pct}%</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'right', minWidth: 100 }}>
                    <div>Purchased</div>
                    <div>{a.purchase_date}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => { setEditingId(a.id); setEditForm({ name: a.name, category: a.category, description: a.description || '', location: a.location || '', serial_no: a.serial_no || '' }); }}
                      style={{ padding: '5px 14px', fontSize: 12, border: '1px solid var(--bd)', borderRadius: 5, backgroundColor: 'var(--bg1)', cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => setDisposeId(a.id)}
                      style={{ padding: '5px 12px', fontSize: 12, border: '1px solid var(--bd)', borderRadius: 5, backgroundColor: 'transparent', color: 'var(--rust)', cursor: 'pointer' }}>Dispose</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
