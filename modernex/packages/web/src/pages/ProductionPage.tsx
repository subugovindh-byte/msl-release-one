// @ts-nocheck
import React, { useState, useMemo, useEffect } from 'react';
import QRCode from 'qrcode';
import { VARIETIES, GRADES, STANDARD_SPECS } from '@modernex/shared';
import {
  useProducts, useCreateProduct, useCreateProductionJob, useChippingJob,
  useProductionJobs, useMoveProduct, usePurchaseOrders,
  useDeleteProduct, useUpdateProduct, useRecordDamage, useQaProduct, useReworkProduct,
  useDeleteProductionJob, useProductionStageStats,
} from '@/hooks/useApi';
import { useToastStore, useAuthStore } from '@/store';

// ── helpers ───────────────────────────────────────────────────────────────────
function sqftFromSize(sizeStr: string) {
  const [l, w] = String(sizeStr).split(/[×xX*]/).map(s => Number(String(s).trim()));
  if (!l || !w) return 0;
  return +((l * w) / 92903.04).toFixed(2);
}

function cftFromM(l: number, w: number, h: number) {
  if (!l || !w || !h) return 0;
  return +((l * w * h) * 35.3147).toFixed(2);
}

function cbmFromM(l: number, w: number, h: number) {
  if (!l || !w || !h) return 0;
  return +(l * w * h).toFixed(3);
}

function volLabel(cft: number, cbm: number) {
  return `${cft} cbmt · ${cbm} CBM`;
}

// Shown in Split/Cut when some Raw-Yard blocks are withheld from job work
// because their source PO isn't approved yet (mirrors the API gate).
function PendingApprovalNote({ n }: { n: number }) {
  if (!n) return null;
  return (
    <div style={{ background: 'rgba(230,160,0,0.1)', border: '1px solid var(--amber)', borderRadius: 6,
      padding: '8px 12px', fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>
      {n} block{n > 1 ? 's' : ''} hidden — source PO pending approval. Approve the PO in Purchase to make {n > 1 ? 'them' : 'it'} available for job work.
    </div>
  );
}

const LOCATION_LABEL: Record<string, string> = {
  RAW_YARD: 'Raw Yard', GANGSAW_IN: 'Gangsaw In',
  GANGSAW_OUT: 'Gangsaw Out', FINISHED_YARD: 'Finished Yard', SHOWROOM: 'Showroom',
};

async function printLabel(p: any) {
  const d = p.dimensions || {};
  let dimStr = '';
  if (p.kind === 'block') {
    const lmm = d.length_m ? Math.round(d.length_m * 100) : null;
    const wmm = d.width_m  ? Math.round(d.width_m  * 100) : null;
    const hmm = d.height_m ? Math.round(d.height_m * 100) : null;
    if (lmm && wmm && hmm) dimStr = `${lmm}×${wmm}×${hmm} cm · ${volLabel(cftFromM(d.length_m,d.width_m,d.height_m), cbmFromM(d.length_m,d.width_m,d.height_m))}`;
  } else if (d.size_lw) {
    dimStr = `${d.size_lw}${d.thickness_mm ? ` · ${d.thickness_mm}cm` : ''}${d.sqft ? ` · ${d.sqft} sqft` : ''}${d.sqft_per_tile ? ` · ${d.sqft_per_tile} sqft/tile` : ''}`;
  }
  const loc  = LOCATION_LABEL[p.current_location_id] || p.current_location_id || '';
  const rate = p.rate_paise ? `₹${(p.rate_paise/100).toLocaleString('en-IN')}` : '';
  const qrDataUrl = await QRCode.toDataURL(p.id, { width: 100, margin: 1, color: { dark: '#000', light: '#fff' } });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Label ${p.id}</title>
<style>
@page{size:80mm 50mm;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;width:80mm;height:50mm;display:flex;align-items:stretch}
.label{display:flex;align-items:center;gap:5px;padding:4px 5px;width:80mm;height:50mm;border:1px solid #999}
.qr{flex-shrink:0}
.info{flex:1;overflow:hidden}
.id{font-size:10px;font-weight:700;font-family:monospace;letter-spacing:.02em}
.variety{font-size:9px;font-weight:600;margin-top:1px}
.row{font-size:7px;color:#333;margin-top:2px}
.badges{margin-top:3px;display:flex;gap:3px}
.badge{border:1px solid #555;border-radius:2px;padding:0 3px;font-size:6.5px;font-weight:700;text-transform:uppercase}
.company{font-size:6px;color:#888;margin-top:4px;border-top:1px solid #ddd;padding-top:2px}
</style></head><body>
<div class="label">
  <div class="qr"><img src="${qrDataUrl}" width="90" height="90"/></div>
  <div class="info">
    <div class="id">${p.id}</div>
    <div class="variety">${p.variety}</div>
    <div class="row">LOT: <b>${p.lot_id || '—'}</b></div>
    ${dimStr ? `<div class="row">${dimStr}</div>` : ''}
    <div class="badges">
      <span class="badge">${p.kind}</span>
      ${p.grade ? `<span class="badge">${p.grade}</span>` : ''}
      ${p.stock != null ? `<span class="badge">Qty ${p.stock}</span>` : ''}
    </div>
    <div class="row" style="margin-top:3px">${loc}${rate ? ` · ${rate}` : ''}</div>
    <div class="company">MODERNEX STONES LLP</div>
  </div>
</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=340,height=220,toolbar=0,menubar=0');
  if (w) { w.document.write(html); w.document.close(); }
}

const SLAB_SIZES = STANDARD_SPECS.slab.sizes_mm.map(s => s.lw);
const SLAB_THICKNESSES = STANDARD_SPECS.slab.thicknesses_mm;
const TILE_SIZES = STANDARD_SPECS.tile.sizes_mm.map(s => s.lw);
const TILE_THICKNESSES = [10, 12, 15, 18, 20, 30, 40, 50];

// ── shared primitive styles ────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 8,
  padding: '16px 20px',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 5,
  color: 'var(--t1)', fontSize: 13, padding: '7px 10px', outline: 'none',
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

const btnPrimary: React.CSSProperties = {
  background: 'var(--rust)', color: '#fff', border: 'none', borderRadius: 5,
  padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  background: 'var(--bg2)', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: 5,
  padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const row3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 };

function Lbl({ children }: { children: any }) {
  return <label style={labelStyle}>{children}</label>;
}
function Inp(props: any) {
  return <input style={inputStyle} {...props} />;
}
function Sel({ children, ...props }: any) {
  return <select style={selectStyle} {...props}>{children}</select>;
}
function Hint({ children }: { children: any }) {
  return <span style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{children}</span>;
}
function Fld({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <div style={fieldStyle}>
      <Lbl>{label}</Lbl>
      {children}
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

// ── pipeline stat card ────────────────────────────────────────────────────────
function StatCard({ label, count, sub, color }: { label: string; count: number; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, textAlign: 'center', minWidth: 120 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--rust)', lineHeight: 1.1 }}>{count}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── tabs ─────────────────────────────────────────────────────────────────────
type Tab = 'receive' | 'split' | 'cut' | 'chipping' | 'polish' | 'qa' | 'route' | 'history';
const TABS: { id: Tab; label: string; step?: string }[] = [
  { id: 'receive',  label: 'Receive Block', step: '1' },
  { id: 'split',    label: 'Split Block',   step: '2' },
  { id: 'cut',      label: 'Cut Slabs',     step: '3' },
  { id: 'chipping', label: 'Chipping',      step: '4' },
  { id: 'polish',   label: 'Polish & Grade',step: '5' },
  { id: 'qa',       label: 'QA Check',      step: '6' },
  { id: 'route',    label: 'Route to Sale', step: '7' },
  { id: 'history',  label: 'Job History' },
];

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            background: active === t.id ? 'var(--rust)' : 'var(--bg2)',
            color: active === t.id ? '#fff' : 'var(--t2)',
            border: `1px solid ${active === t.id ? 'var(--rust)' : 'var(--bd)'}`,
            borderRadius: 5, padding: '6px 14px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {t.step && (
            <span style={{
              background: active === t.id ? 'rgba(255,255,255,0.25)' : 'var(--rustW)',
              color: active === t.id ? '#fff' : 'var(--rust)',
              borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '1px 6px',
            }}>{t.step}</span>
          )}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — RECEIVE BLOCK
// ─────────────────────────────────────────────────────────────────────────────
function nextLotId(allProducts: any[], allPos: any[]): string {
  const nums: number[] = [];
  const re = /LOT-0*(\d+)/i;
  for (const p of allProducts) {
    const m = re.exec(p.lot_id || '');
    if (m) nums.push(+m[1]);
  }
  for (const po of allPos) {
    const m = re.exec(po.lot_id || po.id || '');
    if (m) nums.push(+m[1]);
  }
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `LOT-${String(next).padStart(3, '0')}`;
}

function ReceiveBlock({ notify }: { notify: any }) {
  const createProduct = useCreateProduct();
  const { data: posData }      = usePurchaseOrders({});
  const { data: allProdsData } = useProducts({});
  // Only approved/closed POs can be used to receive blocks
  const allPos   = posData?.purchase_orders || [];
  const pos      = allPos.filter((p: any) => ['approved', 'closed'].includes(p.status));
  const allProds = allProdsData?.products   || [];

  const suggested = useMemo(() => nextLotId(allProds, allPos), [allProds, allPos]);

  const [form, setForm] = useState({
    variety: VARIETIES[0],
    lot_id: '',
    po_id: '',
    length_m: '',
    width_m: '',
    height_m: '',
    rate_paise: '',
    notes: '',
  });

  // Auto-fill lot_id once data loads (only if user hasn't typed anything)
  useEffect(() => {
    setForm(f => f.lot_id ? f : { ...f, lot_id: suggested });
  }, [suggested]);

  // When PO selected: derive lot, auto-fill variety + rate from PO
  function onPoChange(poId: string) {
    setForm(f => {
      const po = pos.find((p: any) => p.id === poId);
      if (!po) return { ...f, po_id: '', variety: VARIETIES[0], rate_paise: '' };
      const newLot = nextLotId(allProds, allPos);
      return {
        ...f,
        po_id: poId,
        lot_id: f.lot_id || newLot,
        variety: po.variety || f.variety,
        rate_paise: po.rate_per_cft_paise ? String(po.rate_per_cft_paise / 100) : f.rate_paise,
      };
    });
  }

  const cft = cftFromM(+form.length_m / 100, +form.width_m / 100, +form.height_m / 100);
  const cbm = cbmFromM(+form.length_m / 100, +form.width_m / 100, +form.height_m / 100);

  // Live duplicate detection: same lot_id already has an active block
  const lotDupes = useMemo(() =>
    allProds.filter((p: any) =>
      p.kind === 'block' && p.active !== 0 &&
      form.lot_id && p.lot_id === form.lot_id && p.variety === form.variety
    ),
    [allProds, form.lot_id, form.variety]
  );

  // Check exact dimension match against existing active blocks in this lot
  const exactDupe = useMemo(() => {
    if (!form.length_m || !form.width_m || !form.height_m) return null;
    const lm = +form.length_m / 100, wm = +form.width_m / 100, hm = +form.height_m / 100;
    return lotDupes.find((p: any) => {
      const d = p.dimensions || {};
      return d.length_m && Math.abs(d.length_m - lm) < 0.001 &&
             Math.abs(d.width_m  - wm) < 0.001 &&
             Math.abs(d.height_m - hm) < 0.001;
    }) || null;
  }, [lotDupes, form.length_m, form.width_m, form.height_m]);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: any) {
    e.preventDefault();
    if (!form.po_id) {
      notify('Select an approved Purchase Order before registering a block', 'error'); return;
    }
    if (!form.variety || !form.lot_id || !form.length_m || !form.width_m || !form.height_m) {
      notify('Fill variety, lot ID and all dimensions', 'error'); return;
    }
    if (exactDupe) {
      notify(`Duplicate block: ${exactDupe.id} already registered with this lot, variety and dimensions.`, 'error');
      return;
    }
    try {
      const product = await createProduct.mutateAsync({
        kind: 'block',
        variety: form.variety,
        lot_id: form.lot_id,
        po_id: form.po_id || undefined,   // structured link — gates downstream job work
        rate_paise: form.rate_paise ? Math.round(+form.rate_paise * 100) : 0,
        stock: 1,
        notes: form.notes || (form.po_id ? `From PO ${form.po_id}` : undefined),
        dimensions: {
          length_m: +form.length_m / 100,
          width_m: +form.width_m / 100,
          height_m: +form.height_m / 100,
        },
      });
      notify(`Block ${(product as any)?.product?.id ?? ''} registered at Raw Yard`, 'success');
      // Reset but keep variety; lot will re-compute from new data
      setForm(f => ({ ...f, lot_id: '', po_id: '', length_m: '', width_m: '', height_m: '', rate_paise: '', notes: '' }));
    } catch (err: any) {
      notify(err.message || 'Failed to register block', 'error');
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
        Select an <strong>approved</strong> Purchase Order to receive a block into <strong style={{ color: 'var(--t1)' }}>Raw Yard</strong>.
        Blocks without an approved PO cannot enter production.
      </p>

      {pos.length === 0 ? (
        <div style={{ background: 'rgba(220,50,50,0.08)', border: '1px solid var(--red)', borderRadius: 6, padding: '12px 16px', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
          No approved Purchase Orders found. Go to <strong>Purchase</strong> and approve a PO before receiving blocks.
        </div>
      ) : (
        <Fld label="Purchase Order *" hint="only approved/closed POs shown">
          <Sel value={form.po_id} onChange={e => onPoChange(e.target.value)} required>
            <option value="">— select approved PO —</option>
            {pos.map((po: any) => (
              <option key={po.id} value={po.id}>
                {po.id} · {po.variety} · {po.blocks} blk · {po.cft} cbmt [{po.status}]
              </option>
            ))}
          </Sel>
        </Fld>
      )}

      {form.po_id && (() => {
        const po = pos.find((p: any) => p.id === form.po_id);
        if (!po) return null;
        return (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '8px 14px', fontSize: 12, color: 'var(--t2)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span><span style={{ color: 'var(--t3)' }}>Vendor:</span> <strong>{po.vendor_name || po.vendor_id}</strong></span>
            <span><span style={{ color: 'var(--t3)' }}>Variety:</span> <strong>{po.variety}</strong></span>
            <span><span style={{ color: 'var(--t3)' }}>Ordered:</span> <strong>{po.blocks} blk · {po.cft} cbmt</strong></span>
            <span><span style={{ color: 'var(--t3)' }}>Rate:</span> <strong>₹{(po.rate_per_cft_paise / 100).toLocaleString()}/cbmt</strong></span>
          </div>
        );
      })()}

      {form.po_id && (
        <div style={row2}>
          <Fld label="Variety">
            <Sel value={form.variety} onChange={e => set('variety', e.target.value)}>
              {VARIETIES.map(v => <option key={v}>{v}</option>)}
            </Sel>
          </Fld>
          <Fld label="Lot ID" hint="auto-assigned — editable">
            <div style={{ position: 'relative' }}>
              <Inp
                value={form.lot_id}
                onChange={e => set('lot_id', e.target.value)}
                placeholder={suggested}
                required
                style={{ ...inputStyle, paddingRight: 72, width: '100%', boxSizing: 'border-box' }}
              />
              {form.lot_id !== suggested && (
                <button
                  type="button"
                  onClick={() => set('lot_id', suggested)}
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    background: 'var(--rustW)', color: 'var(--rust)', border: 'none',
                    borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '2px 7px', cursor: 'pointer',
                  }}
                >reset</button>
              )}
            </div>
          </Fld>
        </div>
      )}

      {form.po_id && (<>
        <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Block Dimensions
          </div>
          <div style={row3}>
            <Fld label="Length (cm)">
              <Inp type="number" step="1" min="0" value={form.length_m} onChange={e => set('length_m', e.target.value)} placeholder="244" required />
            </Fld>
            <Fld label="Width (cm)">
              <Inp type="number" step="1" min="0" value={form.width_m} onChange={e => set('width_m', e.target.value)} placeholder="122" required />
            </Fld>
            <Fld label="Height (cm)">
              <Inp type="number" step="1" min="0" value={form.height_m} onChange={e => set('height_m', e.target.value)} placeholder="122" required />
            </Fld>
          </div>
          {cft > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>
              ≈ {volLabel(cft, cbm)}
            </div>
          )}
        </div>

        {/* Duplicate warnings */}
        {exactDupe && (
          <div style={{ background: 'rgba(220,50,50,0.1)', border: '1px solid var(--red)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
            Duplicate block detected: <span style={{ fontFamily: 'monospace' }}>{exactDupe.id}</span> already has this exact lot, variety and dimensions. Change the lot ID if this is a different physical block.
          </div>
        )}
        {!exactDupe && lotDupes.length > 0 && (
          <div style={{ background: 'rgba(230,160,0,0.1)', border: '1px solid var(--amber)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--amber)' }}>
            Lot <strong>{form.lot_id}</strong> already has {lotDupes.length} block{lotDupes.length > 1 ? 's' : ''} registered ({lotDupes.map((p: any) => p.id).join(', ')}). Confirm dimensions are different.
          </div>
        )}

        <div style={row2}>
          <Fld label="Rate per cbmt (₹)" hint="auto-filled from PO">
            <Inp type="number" min="0" value={form.rate_paise} onChange={e => set('rate_paise', e.target.value)} placeholder="500" />
          </Fld>
          <Fld label="Notes" hint="optional">
            <Inp value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any remark..." />
          </Fld>
        </div>

        <div>
          <button type="submit" style={{ ...btnPrimary, opacity: exactDupe ? 0.5 : 1 }} disabled={createProduct.isPending || !!exactDupe}>
            {createProduct.isPending ? 'Registering…' : 'Register Block at Raw Yard'}
          </button>
        </div>
      </>)}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — SPLIT / DRESS BLOCK
// Mode A: Split — 1 block → 2 sub-blocks
// Mode B: Dress/Trim — 1 block → 1 trimmed block (half-block dressing)
// ─────────────────────────────────────────────────────────────────────────────
function SplitBlock({ rawBlocks, blockedCount = 0, notify, preselectId }: { rawBlocks: any[]; blockedCount?: number; notify: any; preselectId?: string }) {
  const createJob = useCreateProductionJob();
  const [mode, setMode] = useState<'split' | 'dress'>('split');

  const emptyDims = { length_m: '', width_m: '', height_m: '' };
  const [form, setForm] = useState({
    block_id: '',
    sub1: { ...emptyDims },
    sub2: { ...emptyDims },
    labour_paise: '',
    damage_count: '',
    wastage_count: '',
    notes: '',
  });

  useEffect(() => { if (preselectId) setForm(f => ({ ...f, block_id: preselectId })); }, [preselectId]);

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }
  function setSub(n: 1 | 2, k: string, v: string) {
    const key = n === 1 ? 'sub1' : 'sub2';
    setForm(f => ({ ...f, [key]: { ...(f as any)[key], [k]: v } }));
  }

  const selectedBlock = rawBlocks.find(b => b.id === form.block_id);
  const parentDims = selectedBlock?.dimensions || {};
  const parentCft = cftFromM(parentDims.length_m, parentDims.width_m, parentDims.height_m);

  // Convert cm-input fields to metres for calculations
  const toM = (v: string) => +v / 100;
  const cft1 = cftFromM(toM(form.sub1.length_m), toM(form.sub1.width_m), toM(form.sub1.height_m));
  const cbm1 = cbmFromM(toM(form.sub1.length_m), toM(form.sub1.width_m), toM(form.sub1.height_m));
  const cft2 = cftFromM(toM(form.sub2.length_m), toM(form.sub2.width_m), toM(form.sub2.height_m));
  const cbm2 = cbmFromM(toM(form.sub2.length_m), toM(form.sub2.width_m), toM(form.sub2.height_m));

  const outputCft = mode === 'split' ? cft1 + cft2 : cft1;
  const volOver = parentCft > 0 && outputCft > parentCft * 1.03; // >3% over is a likely entry error
  const volWarn = parentCft > 0 && outputCft > parentCft * 0.98 && !volOver; // within 2% of parent (kerf loss OK)

  function resetForm() {
    setForm({ block_id: '', sub1: { ...emptyDims }, sub2: { ...emptyDims }, labour_paise: '', damage_count: '', wastage_count: '', notes: '' });
  }

  async function submit(e: any) {
    e.preventDefault();
    if (!form.block_id) { notify('Select a block', 'error'); return; }
    const { sub1, sub2 } = form;
    const need2 = mode === 'split';
    const missingA = !sub1.length_m || !sub1.width_m || !sub1.height_m;
    const missingB = need2 && (!sub2.length_m || !sub2.width_m || !sub2.height_m);
    if (missingA || missingB) { notify('Enter all dimensions', 'error'); return; }
    if (volOver) { notify('Output volume exceeds source block — check dimensions for typos', 'error'); return; }

    const lot_id = selectedBlock?.lot_id || form.block_id;
    const variety = selectedBlock?.variety || '';
    const shared = {
      lot_id, stage: 'split' as const,
      inputs: [{ product_id: form.block_id, qty_consumed: 1 }],
      labour_paise: form.labour_paise ? Math.round(+form.labour_paise * 100) : 0,
      power_paise: 0, consumables_paise: 0,
      damage_count: form.damage_count ? +form.damage_count : 0,
      wastage_count: form.wastage_count ? +form.wastage_count : 0,
      notes: form.notes || null,
    };
    const mkBlock = (dims: typeof emptyDims) => ({
      kind: 'block' as const, variety, grade: null, rate_paise: 0, qty: 1,
      dimensions: { length_m: toM(dims.length_m), width_m: toM(dims.width_m), height_m: toM(dims.height_m) },
    });

    try {
      if (mode === 'split') {
        await createJob.mutateAsync({ ...shared, outputs: [mkBlock(sub1), mkBlock(sub2)] });
        notify('Split job done — 2 sub-blocks at Raw Yard', 'success');
      } else {
        await createJob.mutateAsync({ ...shared, outputs: [mkBlock(sub1)] });
        notify('Dress/Trim job done — trimmed block at Raw Yard', 'success');
      }
      resetForm();
    } catch (err: any) {
      notify(err.message || 'Failed to create job', 'error');
    }
  }

  // Render helper (called, not mounted) — a nested <Component/> would remount
  // the inputs on every keystroke and drop focus. Calling it inlines the JSX.
  const renderDimCard = (label: string, n: 1 | 2, dims: typeof emptyDims) => {
    const cft = cftFromM(toM(dims.length_m), toM(dims.width_m), toM(dims.height_m));
    const cbm = cbmFromM(toM(dims.length_m), toM(dims.width_m), toM(dims.height_m));
    const oversize = parentCft > 0 && cft > parentCft * 1.03;
    return (
      <div style={{ flex: 1, ...card, display: 'flex', flexDirection: 'column', gap: 10, borderColor: oversize ? 'var(--red)' : 'var(--bd)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: oversize ? 'var(--red)' : 'var(--rust)' }}>{label}</div>
        <div style={row3}>
          <Fld label="Length (cm)">
            <Inp type="number" step="1" min="0" value={dims.length_m} onChange={e => setSub(n, 'length_m', e.target.value)}
              placeholder={parentDims.length_m ? String(Math.round(parentDims.length_m * 100)) : '244'} required />
          </Fld>
          <Fld label="Width (cm)">
            <Inp type="number" step="1" min="0" value={dims.width_m} onChange={e => setSub(n, 'width_m', e.target.value)}
              placeholder={parentDims.width_m ? String(Math.round(parentDims.width_m * 100)) : '122'} required />
          </Fld>
          <Fld label="Height (cm)">
            <Inp type="number" step="1" min="0" value={dims.height_m} onChange={e => setSub(n, 'height_m', e.target.value)}
              placeholder={parentDims.height_m ? String(Math.round(parentDims.height_m * 100)) : '60'} required />
          </Fld>
        </div>
        {cft > 0 && (
          <div style={{ fontSize: 12, color: oversize ? 'var(--red)' : 'var(--gold)', fontWeight: oversize ? 700 : 400 }}>
            ≈ {volLabel(cft, cbm)}{oversize ? '  △ exceeds parent' : ''}
          </div>
        )}
      </div>
    );
  }

  if (rawBlocks.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PendingApprovalNote n={blockedCount} />
        <div style={{ ...card, color: 'var(--t3)', fontSize: 13 }}>
          {blockedCount > 0
            ? 'No approved blocks at Raw Yard. The blocks here are waiting on PO approval.'
            : 'No blocks at Raw Yard. Register one in step 1 first.'}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {(['split', 'dress'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)} style={{
            padding: '6px 18px', borderRadius: 5, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: mode === m ? 'var(--rust)' : 'var(--bg2)',
            color: mode === m ? '#fff' : 'var(--t2)',
            border: `1px solid ${mode === m ? 'var(--rust)' : 'var(--bd)'}`,
          }}>
            {m === 'split' ? '✂ Split into 2 sub-blocks' : '🔲 Dress / Trim (single block)'}
          </button>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
        {mode === 'split'
          ? 'Split a block into two sub-blocks (1A and 1B). Both stay at Raw Yard.'
          : 'Gangsaw-dress a half-block or rough block into a clean rectangular shape. The original block is consumed and one trimmed block is produced.'}
      </p>

      <PendingApprovalNote n={blockedCount} />

      {/* Block selector */}
      <Fld label="Select Block">
        <Sel value={form.block_id} onChange={e => set('block_id', e.target.value)} required>
          <option value="">— select block —</option>
          {rawBlocks.map((b: any) => {
            const d = b.dimensions || {};
            const cft = cftFromM(d.length_m, d.width_m, d.height_m);
            const cbm = cbmFromM(d.length_m, d.width_m, d.height_m);
            return (
              <option key={b.id} value={b.id}>
                {b.id} · {b.variety} {b.lot_id ? `(${b.lot_id})` : ''} {cft > 0 ? `— ${volLabel(cft, cbm)}` : ''}
              </option>
            );
          })}
        </Sel>
      </Fld>

      {selectedBlock && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: -8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>Source: <strong style={{ color: 'var(--t1)' }}>{selectedBlock.variety}</strong></span>
          {parentCft > 0 && <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
            {(() => { const d = parentDims; return `${Math.round(d.length_m*100)}×${Math.round(d.width_m*100)}×${Math.round(d.height_m*100)} cm · ${volLabel(parentCft, cbmFromM(d.length_m,d.width_m,d.height_m))}`; })()}
          </span>}
        </div>
      )}

      {/* Output dimension cards */}
      <div style={{ display: 'flex', gap: 12 }}>
        {renderDimCard(mode === 'split' ? 'Sub-block 1A' : 'Trimmed block (output)', 1, form.sub1)}
        {mode === 'split' && renderDimCard('Sub-block 1B', 2, form.sub2)}
      </div>

      {/* Volume balance warning */}
      {parentCft > 0 && outputCft > 0 && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
          background: volOver ? 'rgba(220,50,50,0.1)' : volWarn ? 'rgba(0,180,100,0.08)' : 'var(--bg2)',
          border: `1px solid ${volOver ? 'var(--red)' : volWarn ? 'var(--sage)' : 'var(--bd)'}`,
          color: volOver ? 'var(--red)' : volWarn ? 'var(--sage)' : 'var(--t3)',
        }}>
          {volOver
            ? `Output ${outputCft.toFixed(1)} cbmt > source ${parentCft.toFixed(1)} cbmt — check for typos in dimensions`
            : `Output ${outputCft.toFixed(1)} cbmt vs source ${parentCft.toFixed(1)} cbmt (${((outputCft/parentCft)*100).toFixed(1)}% yield — kerf loss ${(parentCft - outputCft).toFixed(1)} cbmt)`
          }
        </div>
      )}

      <div style={row2}>
        <Fld label="Labour Cost (₹)" hint="optional">
          <Inp type="number" min="0" value={form.labour_paise} onChange={e => set('labour_paise', e.target.value)} placeholder="0" />
        </Fld>
        <Fld label="Notes" hint="optional">
          <Inp value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. cut from quarry half-block" />
        </Fld>
      </div>

      <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Damages &amp; Wastage
        </div>
        <div style={row2}>
          <Fld label="Damaged pieces" hint="blocks cracked / broken">
            <Inp type="number" min="0" step="1" value={form.damage_count} onChange={e => set('damage_count', e.target.value)} placeholder="0" />
          </Fld>
          <Fld label="Wastage (cbmt)" hint="trim / kerf material removed">
            <Inp type="number" min="0" step="1" value={form.wastage_count} onChange={e => set('wastage_count', e.target.value)} placeholder="0" />
          </Fld>
        </div>
      </div>

      <div>
        <button type="submit" style={{ ...btnPrimary, opacity: volOver ? 0.5 : 1 }} disabled={createJob.isPending || volOver}>
          {createJob.isPending ? 'Creating…' : mode === 'split' ? 'Create Split Job' : 'Create Dress / Trim Job'}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — CUT (GANGSAW) — slab or tile output
// ─────────────────────────────────────────────────────────────────────────────
function CutSlabs({ rawBlocks, blockedCount = 0, notify, preselectId }: { rawBlocks: any[]; blockedCount?: number; notify: any; preselectId?: string }) {
  const createJob = useCreateProductionJob();

  const [outputKind, setOutputKind] = useState<'slab' | 'tile'>('slab');
  const [form, setForm] = useState({
    block_id: '',
    count: '',
    // slab fields
    slab_size: SLAB_SIZES[4] || '2600×1600',
    slab_thickness: '20',
    // tile fields
    tile_size: TILE_SIZES[3] || '600×600',
    tile_thickness: '18',
    // shared
    grade: 'A',
    rate_rs: '',
    labour_paise: '',
    power_paise: '',
    damage_count: '',
    wastage_count: '',
    notes: '',
  });

  useEffect(() => { if (preselectId) setForm(f => ({ ...f, block_id: preselectId })); }, [preselectId]);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const selectedBlock = rawBlocks.find(b => b.id === form.block_id);

  const isSlab = outputKind === 'slab';
  const size   = isSlab ? form.slab_size : form.tile_size;
  const sqft   = sqftFromSize(size);

  function buildOutput() {
    const variety = selectedBlock?.variety || '';
    const rate_paise = Math.round(+form.rate_rs * 100);
    const qty = +form.count;
    if (isSlab) {
      return {
        kind: 'slab', variety, grade: form.grade, rate_paise, qty,
        dimensions: { size_lw: form.slab_size, thickness_mm: +form.slab_thickness, sqft },
      };
    }
    return {
      kind: 'tile', variety, grade: form.grade, rate_paise, qty,
      dimensions: {
        size_lw: form.tile_size,
        thickness_mm: +form.tile_thickness,
        sqft_per_tile: sqft,
        pieces_per_box: STANDARD_SPECS.tile.pieces_per_box[form.tile_size] || 1,
      },
    };
  }

  async function submit(e: any) {
    e.preventDefault();
    if (!form.block_id) { notify('Select a block to cut', 'error'); return; }
    if (!form.count || +form.count < 1) { notify('Enter piece count', 'error'); return; }
    if (!form.rate_rs) { notify('Enter rate per sqft', 'error'); return; }
    try {
      const lot_id = selectedBlock?.lot_id || form.block_id;
      await createJob.mutateAsync({
        lot_id,
        stage: 'cut',
        inputs: [{ product_id: form.block_id, qty_consumed: 1 }],
        outputs: [buildOutput()],
        labour_paise: form.labour_paise ? Math.round(+form.labour_paise * 100) : 0,
        power_paise:  form.power_paise  ? Math.round(+form.power_paise  * 100) : 0,
        consumables_paise: 0,
        damage_count: form.damage_count ? +form.damage_count : 0,
        wastage_count: form.wastage_count ? +form.wastage_count : 0,
        notes: form.notes || null,
      });
      notify(`Cut job done — ${form.count} ${outputKind}s at Gangsaw Out`, 'success');
      setForm(f => ({ ...f, block_id: '', count: '', damage_count: '', wastage_count: '', notes: '' }));
    } catch (err: any) {
      notify(err.message || 'Failed to create cut job', 'error');
    }
  }

  if (rawBlocks.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PendingApprovalNote n={blockedCount} />
        <div style={{ ...card, color: 'var(--t3)', fontSize: 13 }}>
          {blockedCount > 0
            ? 'No approved blocks at Raw Yard. The blocks here are waiting on PO approval.'
            : 'No blocks available at Raw Yard. Register and optionally split a block first.'}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
        Gangsaw cut job — produces <strong style={{ color: 'var(--t1)' }}>slabs</strong> or <strong style={{ color: 'var(--t1)' }}>tiles</strong>. Output lands at <strong style={{ color: 'var(--t1)' }}>Gangsaw Out</strong>.
      </p>

      {/* Output kind toggle */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['slab', 'tile'] as const).map(k => (
          <button key={k} type="button"
            onClick={() => setOutputKind(k)}
            style={{
              padding: '5px 16px', borderRadius: 5, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: outputKind === k ? 'var(--gold)' : 'var(--bg2)',
              color: outputKind === k ? '#fff' : 'var(--t2)',
              border: `1px solid ${outputKind === k ? 'var(--gold)' : 'var(--bd)'}`,
            }}
          >{k === 'slab' ? 'Slab' : 'Tile'}</button>
        ))}
      </div>

      <PendingApprovalNote n={blockedCount} />

      <Fld label="Select Block">
        <Sel value={form.block_id} onChange={e => set('block_id', e.target.value)} required>
          <option value="">— select block —</option>
          {rawBlocks.map((b: any) => {
            const dims = b.dimensions || {};
            const cft = cftFromM(dims.length_m, dims.width_m, dims.height_m);
            const cbm = cbmFromM(dims.length_m, dims.width_m, dims.height_m);
            return (
              <option key={b.id} value={b.id}>
                {b.id} · {b.variety} {b.lot_id ? `(${b.lot_id})` : ''} {cft > 0 ? `— ${volLabel(cft, cbm)}` : ''}
              </option>
            );
          })}
        </Sel>
      </Fld>

      <div style={row2}>
        <Fld label={`${isSlab ? 'Slab' : 'Tile'} Count (pieces)`} hint={isSlab ? '10–75 typically' : 'from one block'}>
          <Inp type="number" min="1" max="5000" value={form.count}
            onChange={e => set('count', e.target.value)}
            placeholder={isSlab ? '25' : '200'} required />
        </Fld>

        {isSlab ? (
          <Fld label="Slab Size" hint={!SLAB_SIZES.includes(form.slab_size) && form.slab_size ? `${sqftFromSize(form.slab_size)} sqft` : undefined}>
            <Sel value={SLAB_SIZES.includes(form.slab_size) ? form.slab_size : '__custom__'}
              onChange={e => set('slab_size', e.target.value === '__custom__' ? '' : e.target.value)}>
              {SLAB_SIZES.map(s => (
                <option key={s} value={s}>{s} ({sqftFromSize(s)} sqft)</option>
              ))}
              <option value="__custom__">Custom size…</option>
            </Sel>
            {!SLAB_SIZES.includes(form.slab_size) && (
              <Inp style={{ ...inputStyle, marginTop: 4 }} value={form.slab_size}
                onChange={e => set('slab_size', e.target.value)} placeholder="L×W cm e.g. 3200×1500" autoFocus />
            )}
          </Fld>
        ) : (
          <Fld label="Tile Size" hint={!TILE_SIZES.includes(form.tile_size) && form.tile_size ? `${sqftFromSize(form.tile_size)} sqft/tile` : undefined}>
            <Sel value={TILE_SIZES.includes(form.tile_size) ? form.tile_size : '__custom__'}
              onChange={e => set('tile_size', e.target.value === '__custom__' ? '' : e.target.value)}>
              {TILE_SIZES.map(s => (
                <option key={s} value={s}>{s} ({sqftFromSize(s)} sqft/tile)</option>
              ))}
              <option value="__custom__">Custom size…</option>
            </Sel>
            {!TILE_SIZES.includes(form.tile_size) && (
              <Inp style={{ ...inputStyle, marginTop: 4 }} value={form.tile_size}
                onChange={e => set('tile_size', e.target.value)} placeholder="L×W cm e.g. 45×45" autoFocus />
            )}
          </Fld>
        )}
      </div>

      <div style={row3}>
        <Fld label="Thickness (cm)">
          {isSlab ? (
            <Sel value={form.slab_thickness} onChange={e => set('slab_thickness', e.target.value)}>
              {SLAB_THICKNESSES.map(t => <option key={t} value={t}>{t} cm</option>)}
            </Sel>
          ) : (
            <Sel value={form.tile_thickness} onChange={e => set('tile_thickness', e.target.value)}>
              {TILE_THICKNESSES.map(t => <option key={t} value={t}>{t} cm</option>)}
            </Sel>
          )}
        </Fld>
        <Fld label="Grade">
          <Sel value={form.grade} onChange={e => set('grade', e.target.value)}>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </Sel>
        </Fld>
        <Fld label="Rate per sqft (₹)" hint="selling rate">
          <Inp type="number" min="0" step="0.01" value={form.rate_rs}
            onChange={e => set('rate_rs', e.target.value)} placeholder="420" required />
        </Fld>
      </div>

      {sqft > 0 && form.count && form.rate_rs && (
        <div style={{ ...card, background: 'var(--bg2)', fontSize: 12, color: 'var(--t2)' }}>
          {form.count} {outputKind}s × {sqft} sqft × ₹{form.rate_rs}/sqft
          {' = '}
          <strong style={{ color: 'var(--sage)' }}>
            ₹{(+form.count * sqft * +form.rate_rs).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </strong> total value
        </div>
      )}

      <div style={row2}>
        <Fld label="Labour Cost (₹)" hint="optional">
          <Inp type="number" min="0" value={form.labour_paise} onChange={e => set('labour_paise', e.target.value)} placeholder="0" />
        </Fld>
        <Fld label="Power Cost (₹)" hint="optional">
          <Inp type="number" min="0" value={form.power_paise} onChange={e => set('power_paise', e.target.value)} placeholder="0" />
        </Fld>
      </div>

      <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Damages &amp; Wastage
        </div>
        <div style={row2}>
          <Fld label="Damaged pieces" hint="slabs/tiles cracked or broken (unplanned)">
            <Inp type="number" min="0" step="1" value={form.damage_count} onChange={e => set('damage_count', e.target.value)} placeholder="0" />
          </Fld>
          <Fld label="Wastage pieces" hint="trim / offcuts / saw-kerf losses (planned)">
            <Inp type="number" min="0" step="1" value={form.wastage_count} onChange={e => set('wastage_count', e.target.value)} placeholder="0" />
          </Fld>
        </div>
      </div>

      <Fld label="Notes" hint="optional">
        <Inp value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. gangsaw machine #2" />
      </Fld>

      <div>
        <button type="submit" style={btnPrimary} disabled={createJob.isPending}>
          {createJob.isPending ? 'Creating…' : `Create Cut Job → ${isSlab ? 'Slabs' : 'Tiles'}`}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — CHIPPING (waste → chips product, side-branch)
// ─────────────────────────────────────────────────────────────────────────────
function Chipping({ blocks, notify }: { blocks: any[]; notify: any }) {
  const chip = useChippingJob();
  const [form, setForm] = useState({
    variety: VARIETIES[0], lot_id: '', source_product_id: '',
    tonnes: '', rate_rs: '', labour_rs: '', power_rs: '', mesh_mm: '', notes: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: any) {
    e.preventDefault();
    if (!form.variety || !form.lot_id || !form.tonnes || +form.tonnes <= 0) {
      notify('Fill variety, lot ID and a positive tonnage', 'error'); return;
    }
    try {
      const res = await chip.mutateAsync({
        lot_id: form.lot_id,
        variety: form.variety,
        source_product_id: form.source_product_id || undefined,
        tonnes: +form.tonnes,
        rate_paise: form.rate_rs ? Math.round(+form.rate_rs * 100) : 0,
        labour_paise: form.labour_rs ? Math.round(+form.labour_rs * 100) : 0,
        power_paise: form.power_rs ? Math.round(+form.power_rs * 100) : 0,
        mesh_size_mm: form.mesh_mm ? +form.mesh_mm : undefined,
        notes: form.notes || undefined,
      });
      notify(`Chips batch ${(res as any)?.product?.id ?? ''} recovered — ${form.tonnes} MT at Raw Yard`, 'success');
      setForm(f => ({ ...f, lot_id: '', source_product_id: '', tonnes: '', rate_rs: '', labour_rs: '', power_rs: '', mesh_mm: '', notes: '' }));
    } catch (err: any) {
      notify(err.message || 'Chipping failed', 'error');
    }
  }

  const conv = (+form.labour_rs || 0) + (+form.power_rs || 0);
  const unitCost = form.tonnes && +form.tonnes > 0 ? (conv / +form.tonnes).toFixed(2) : '0';

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
        Recover offcut/waste into a <strong style={{ color: 'var(--t1)' }}>chips / aggregate</strong> batch (HSN 2517). It branches off the slab line and lands at <strong style={{ color: 'var(--t1)' }}>Raw Yard</strong> as sellable stock in tonnes.
      </p>
      <div style={row2}>
        <Fld label="Variety">
          <Sel value={form.variety} onChange={e => set('variety', e.target.value)}>
            {VARIETIES.map(v => <option key={v}>{v}</option>)}
          </Sel>
        </Fld>
        <Fld label="Lot ID"><Inp value={form.lot_id} onChange={e => set('lot_id', e.target.value)} placeholder="LOT-024" required /></Fld>
      </div>
      {blocks.length > 0 && (
        <Fld label="Source block (optional)" hint="lineage only — not consumed">
          <Sel value={form.source_product_id} onChange={e => set('source_product_id', e.target.value)}>
            <option value="">— none —</option>
            {blocks.map((b: any) => <option key={b.id} value={b.id}>{b.id} · {b.variety} {b.lot_id ? `(${b.lot_id})` : ''}</option>)}
          </Sel>
        </Fld>
      )}
      <div style={row2}>
        <Fld label="Tonnes recovered (MT)"><Inp type="number" step="0.01" min="0" value={form.tonnes} onChange={e => set('tonnes', e.target.value)} placeholder="12.5" required /></Fld>
        <Fld label="Rate per MT (₹)"><Inp type="number" min="0" value={form.rate_rs} onChange={e => set('rate_rs', e.target.value)} placeholder="900" /></Fld>
      </div>
      <div style={row3}>
        <Fld label="Labour (₹)"><Inp type="number" min="0" value={form.labour_rs} onChange={e => set('labour_rs', e.target.value)} placeholder="2000" /></Fld>
        <Fld label="Power (₹)"><Inp type="number" min="0" value={form.power_rs} onChange={e => set('power_rs', e.target.value)} placeholder="500" /></Fld>
        <Fld label="Mesh size (mm)" hint="optional"><Inp type="number" step="0.1" min="0" value={form.mesh_mm} onChange={e => set('mesh_mm', e.target.value)} placeholder="20" /></Fld>
      </div>
      {conv > 0 && (
        <div style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>
          Conversion cost ≈ ₹{conv.toLocaleString('en-IN')} → ₹{unitCost}/MT COGS
        </div>
      )}
      <Fld label="Notes" hint="optional"><Inp value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Crushed from LOT-024 offcuts…" /></Fld>
      <div>
        <button type="submit" style={btnPrimary} disabled={chip.isPending}>
          {chip.isPending ? 'Recording…' : 'Record Chips Batch'}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — POLISH & GRADE
// ─────────────────────────────────────────────────────────────────────────────
function PolishGrade({ gangsawSlabs, notify, preselectId }: { gangsawSlabs: any[]; notify: any; preselectId?: string }) {
  const createJob = useCreateProductionJob();

  const [form, setForm] = useState({
    slab_id: '',
    out_qty: '',
    grade: 'A',
    rate_rs: '',
    labour_paise: '',
    damage_count: '',
    wastage_count: '',
    notes: '',
  });

  useEffect(() => { if (preselectId) setForm(f => ({ ...f, slab_id: preselectId })); }, [preselectId]);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const selectedSlab = gangsawSlabs.find(s => s.id === form.slab_id);

  async function submit(e: any) {
    e.preventDefault();
    if (!form.slab_id) { notify('Select a slab batch to polish', 'error'); return; }
    if (!form.out_qty || +form.out_qty < 1) { notify('Enter output quantity', 'error'); return; }
    if (!form.rate_rs) { notify('Enter rate per sqft', 'error'); return; }
    const lot_id = selectedSlab?.lot_id || form.slab_id;
    const variety = selectedSlab?.variety || '';
    const dims = selectedSlab?.dimensions || {};
    const isTile = selectedSlab?.kind === 'tile';
    try {
      await createJob.mutateAsync({
        lot_id,
        stage: 'polish',
        inputs: [{ product_id: form.slab_id, qty_consumed: selectedSlab?.stock || +form.out_qty }],
        outputs: [{
          kind: isTile ? 'tile' : 'slab',
          variety,
          grade: form.grade,
          rate_paise: Math.round(+form.rate_rs * 100),
          qty: +form.out_qty,
          dimensions: isTile ? {
            size_lw: dims.size_lw || '600×600',
            thickness_mm: dims.thickness_mm || 18,
            sqft_per_tile: dims.sqft_per_tile || sqftFromSize(dims.size_lw || '600×600'),
            pieces_per_box: dims.pieces_per_box || 1,
          } : {
            size_lw: dims.size_lw || '2600×1600',
            thickness_mm: dims.thickness_mm || 20,
            sqft: dims.sqft || sqftFromSize(dims.size_lw || '2600×1600'),
          },
        }],
        labour_paise: form.labour_paise ? Math.round(+form.labour_paise * +form.out_qty * 100) : 0,
        power_paise: 0,
        consumables_paise: 0,
        damage_count: form.damage_count ? +form.damage_count : 0,
        wastage_count: form.wastage_count ? +form.wastage_count : 0,
        notes: form.notes || null,
      });
      notify(`Polish job done — ${form.out_qty} ${isTile ? 'tile' : 'slab'}(s) at Finished Yard`, 'success');
      setForm(f => ({ ...f, slab_id: '', out_qty: '', damage_count: '', wastage_count: '', notes: '' }));
    } catch (err: any) {
      notify(err.message || 'Failed to create polish job', 'error');
    }
  }

  if (gangsawSlabs.length === 0) {
    return (
      <div style={{ ...card, color: 'var(--t3)', fontSize: 13 }}>
        No slabs or tiles at Gangsaw Out. Complete a cut job first (step 3).
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 500 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
        Run polishing on rough slabs or tiles. Graded output moves to <strong style={{ color: 'var(--t1)' }}>Finished Yard</strong>.
      </p>

      <Fld label="Select Slab / Tile Batch (from Gangsaw Out)">
        <Sel value={form.slab_id} onChange={e => set('slab_id', e.target.value)} required>
          <option value="">— select batch —</option>
          {gangsawSlabs.map((s: any) => {
            const dims = s.dimensions || {};
            return (
              <option key={s.id} value={s.id}>
                {s.id} [{s.kind}] · {s.variety} {dims.size_lw ? `${dims.size_lw}` : ''} {dims.thickness_mm ? `${dims.thickness_mm}cm` : ''} {s.grade ? `[${s.grade}]` : ''} · {s.stock} pcs
              </option>
            );
          })}
        </Sel>
      </Fld>

      {selectedSlab && (
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>
          Available: <strong style={{ color: 'var(--t1)' }}>{selectedSlab.stock} pcs</strong>
          {selectedSlab.dimensions?.size_lw && <> · {selectedSlab.dimensions.size_lw} · {selectedSlab.dimensions.thickness_mm}cm</>}
        </div>
      )}

      <div style={row3}>
        <Fld label="Output Quantity" hint="pieces after polishing">
          <Inp type="number" min="1" value={form.out_qty}
            max={selectedSlab?.stock || undefined}
            onChange={e => set('out_qty', e.target.value)}
            placeholder={selectedSlab ? String(selectedSlab.stock) : '15'} required />
        </Fld>
        <Fld label="Grade after polishing">
          <Sel value={form.grade} onChange={e => set('grade', e.target.value)}>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </Sel>
        </Fld>
        <Fld label="Rate per sqft (₹)">
          <Inp type="number" min="0" step="0.01" value={form.rate_rs} onChange={e => set('rate_rs', e.target.value)} placeholder="500" required />
        </Fld>
      </div>

      <div style={row2}>
        <Fld label="Labour Cost per piece (₹)"
          hint={form.labour_paise && form.out_qty
            ? `Total: ₹${(+form.labour_paise * +form.out_qty).toLocaleString('en-IN')}`
            : 'per slab / tile — multiplied by output qty'}>
          <Inp type="number" min="0" step="0.01" value={form.labour_paise} onChange={e => set('labour_paise', e.target.value)} placeholder="90" />
        </Fld>
        <Fld label="Notes" hint="optional">
          <Inp value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any remark..." />
        </Fld>
      </div>

      <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Damages &amp; Wastage
        </div>
        <div style={row2}>
          <Fld label="Damaged pieces" hint="slabs cracked/rejected during polishing">
            <Inp type="number" min="0" step="1" value={form.damage_count} onChange={e => set('damage_count', e.target.value)} placeholder="0" />
          </Fld>
          <Fld label="Wastage pieces" hint="edge chips / below-grade discard">
            <Inp type="number" min="0" step="1" value={form.wastage_count} onChange={e => set('wastage_count', e.target.value)} placeholder="0" />
          </Fld>
        </div>
      </div>

      <div>
        <button type="submit" style={btnPrimary} disabled={createJob.isPending}>
          {createJob.isPending ? 'Creating…' : 'Create Polish Job'}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — QA CHECK (Gate 3)
// Polished goods land here as 'pending' and must pass QA before Route to Sale.
// ─────────────────────────────────────────────────────────────────────────────
function QACheck({ qaPending, notify }: { qaPending: any[]; notify: any }) {
  const qa = useQaProduct();
  const rework = useReworkProduct();
  const [noteFor, setNoteFor] = useState<string>('');
  const [noteText, setNoteText] = useState('');
  const [passFor, setPassFor] = useState<string>('');   // item awaiting rate confirm on pass
  const [rateText, setRateText] = useState('');

  function runQa(id: string, result: 'pass' | 'fail', currentRatePaise?: number) {
    // First click opens an inline confirm: fail → reason, pass → sale rate.
    if (result === 'fail' && noteFor !== id) { setNoteFor(id); setPassFor(''); return; }
    if (result === 'pass' && passFor !== id) {
      setPassFor(id); setNoteFor('');
      setRateText(currentRatePaise ? String(currentRatePaise / 100) : '');
      return;
    }
    const rate_paise = result === 'pass' && rateText ? Math.round(parseFloat(rateText) * 100) : undefined;
    qa.mutate(
      { id, result, notes: result === 'fail' ? (noteText || undefined) : undefined, rate_paise },
      {
        onSuccess: () => {
          notify(result === 'pass' ? `QA passed — ${id} cleared for sale` : `QA failed — ${id} held for rework`, result === 'pass' ? 'success' : 'error');
          setNoteFor(''); setNoteText(''); setPassFor(''); setRateText('');
        },
        onError: (e: any) => notify(e.message || 'QA update failed', 'error'),
      }
    );
  }

  function sendBackToPolish(id: string) {
    const reason = window.prompt('Reason for rework (sent back to re-polish):', 'QA fail — re-polish');
    if (!reason || reason.trim().length < 3) { if (reason !== null) notify('A reason (min 3 chars) is required', 'error'); return; }
    rework.mutate({ id, reason: reason.trim() }, {
      onSuccess: () => notify(`${id} sent back to Gangsaw Out for re-polish`, 'success'),
      onError: (e: any) => notify(e.message || 'Rework failed', 'error'),
    });
  }

  if (qaPending.length === 0) {
    return (
      <div style={{ ...card, color: 'var(--t3)', fontSize: 13 }}>
        Nothing awaiting QA. Polished slabs appear here for a pass/fail check before they can be routed to sale.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
        Finished goods pending QA. <strong style={{ color: 'var(--t1)' }}>Pass</strong> clears an item for the sales yard; <strong style={{ color: 'var(--t1)' }}>Fail</strong> holds it. A failed item can be <strong style={{ color: 'var(--t1)' }}>sent back to re-polish</strong> — it cannot be moved to sale or invoiced until it passes.
      </p>
      {qaPending.map((p: any) => {
        const d = p.dimensions || {};
        const failed = p.qa_status === 'failed';
        return (
          <div key={p.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10,
            borderColor: failed ? 'var(--red)' : 'var(--bd)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, color: 'var(--t1)' }}>
                  {p.variety} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>· {p.id}</span>
                  {failed && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>QA FAILED</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                  {d.size_lw || ''}{d.thickness_mm ? ` · ${d.thickness_mm}cm` : ''}{p.grade ? ` · Gr.${p.grade}` : ''} · stock {p.stock}
                </div>
              </div>
              {!failed && (
                <>
                  <button type="button" style={{ ...btnPrimary, background: 'var(--sage)' }}
                    onClick={() => runQa(p.id, 'pass', p.rate_paise)} disabled={qa.isPending}>✓ Pass</button>
                  <button type="button" style={{ ...btnPrimary, background: 'var(--red)' }}
                    onClick={() => runQa(p.id, 'fail')} disabled={qa.isPending}>✕ Fail</button>
                </>
              )}
              {failed && (
                <button type="button" style={{ ...btnPrimary, background: 'var(--amber)' }}
                  onClick={() => sendBackToPolish(p.id)} disabled={rework.isPending}>↩ Rework (re-polish)</button>
              )}
            </div>
            {passFor === p.id && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>Confirm sale rate ₹/sqft</span>
                <input type="number" min="0" step="0.01" value={rateText} onChange={e => setRateText(e.target.value)}
                  placeholder="rate" style={{ ...inputStyle, width: 120 }} />
                <button type="button" style={{ ...btnPrimary, background: 'var(--sage)' }}
                  onClick={() => runQa(p.id, 'pass')} disabled={qa.isPending}>Confirm Pass</button>
              </div>
            )}
            {noteFor === p.id && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Reason for failure (optional)"
                  style={{ ...inputStyle, flex: 1 }} />
                <button type="button" style={{ ...btnPrimary, background: 'var(--red)' }}
                  onClick={() => runQa(p.id, 'fail')} disabled={qa.isPending}>Confirm Fail</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 6 — ROUTE TO SALE
// ─────────────────────────────────────────────────────────────────────────────
function RouteToSale({ finishedSlabs, notify, preselectId }: { finishedSlabs: any[]; notify: any; preselectId?: string }) {
  const moveProduct = useMoveProduct();
  const [selected, setSelected] = useState<string[]>([]);
  const [destination, setDestination] = useState('SHOWROOM');
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (preselectId) setSelected(s => s.includes(preselectId) ? s : [...s, preselectId]);
  }, [preselectId]);

  function toggleSlab(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }
  function toggleAll() {
    setSelected(s => s.length === finishedSlabs.length ? [] : finishedSlabs.map(s => s.id));
  }

  async function doMove() {
    if (!selected.length) { notify('Select at least one slab', 'error'); return; }
    setMoving(true);
    try {
      await Promise.all(selected.map(id =>
        moveProduct.mutateAsync({ id, data: { to_location_id: destination, move_type: 'move' } })
      ));
      notify(`${selected.length} slab(s) moved to ${destination}`, 'success');
      setSelected([]);
    } catch (err: any) {
      notify(err.message || 'Failed to move slabs', 'error');
    } finally {
      setMoving(false);
    }
  }

  if (finishedSlabs.length === 0) {
    return (
      <div style={{ ...card, color: 'var(--t3)', fontSize: 13 }}>
        No slabs at Finished Yard. Complete a polish job first (step 4).
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--t3)' }}>
        Move finished slabs to <strong style={{ color: 'var(--t1)' }}>Showroom</strong> or another location for sale.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Fld label="Destination">
          <Sel value={destination} onChange={e => setDestination(e.target.value)} style={{ ...selectStyle, minWidth: 160 }}>
            <option value="SHOWROOM">Showroom</option>
            <option value="FINISHED_YARD">Finished Yard</option>
            <option value="RAW_YARD">Raw Yard</option>
          </Sel>
        </Fld>
        <div style={{ marginTop: 20 }}>
          <button type="button" style={btnSecondary} onClick={toggleAll}>
            {selected.length === finishedSlabs.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <div style={{ marginTop: 20 }}>
          <button type="button" style={btnPrimary} onClick={doMove} disabled={moving || !selected.length}>
            {moving ? 'Moving…' : `Move ${selected.length || ''} Slab(s)`}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {finishedSlabs.map((s: any) => {
          const dims = s.dimensions || {};
          const sel = selected.includes(s.id);
          return (
            <div
              key={s.id}
              onClick={() => toggleSlab(s.id)}
              style={{
                ...card, cursor: 'pointer', padding: '10px 16px',
                borderColor: sel ? 'var(--rust)' : 'var(--bd)',
                background: sel ? 'var(--rustW)' : 'var(--bg1)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{s.id}</span>
                <span style={{ fontSize: 12, color: 'var(--t3)', marginLeft: 10 }}>
                  {s.variety} · {dims.size_lw || ''} · {s.grade || ''} · {s.stock} pcs
                </span>
              </div>
              <div style={{
                width: 18, height: 18, borderRadius: 4,
                border: `2px solid ${sel ? 'var(--rust)' : 'var(--bd)'}`,
                background: sel ? 'var(--rust)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {sel && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 7 — JOB HISTORY
// ─────────────────────────────────────────────────────────────────────────────
const STAGE_LABEL: Record<string, string> = {
  split: 'Split', cut: 'Cut', chipping: 'Chipping', polish: 'Polish', done: 'Done / Other',
};
// Per-stage damage / wastage / yield rollup (Phase D). Loss counts are in each
// stage's own unit; a single cross-stage yield% is intentionally not shown
// because the transforms cross UOMs (block cft → slab sqft → pieces).
function StageLossTable() {
  const { data } = useProductionStageStats(90);
  const rows = data?.by_stage || [];
  if (rows.length === 0) return null;
  const th: React.CSSProperties = { textAlign: 'right', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--bd)' };
  const td: React.CSSProperties = { textAlign: 'right', padding: '6px 10px', fontSize: 12, color: 'var(--t2)', borderBottom: '1px solid var(--bd)' };
  const rupees = (p: number) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <div style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>
        Per-stage loss & yield <span style={{ color: 'var(--t3)', fontWeight: 400 }}>· last 90 days</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Stage</th>
            <th style={th}>Jobs</th>
            <th style={th}>Damage</th>
            <th style={th}>Wastage</th>
            <th style={th}>Avg Yield</th>
            <th style={th}>Conv. Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.stage}>
              <td style={{ ...td, textAlign: 'left', color: 'var(--t1)', fontWeight: 600 }}>{STAGE_LABEL[r.stage] || r.stage}</td>
              <td style={td}>{r.jobs}</td>
              <td style={{ ...td, color: r.damage > 0 ? 'var(--red)' : 'var(--t3)' }}>{r.damage || 0}</td>
              <td style={{ ...td, color: r.wastage > 0 ? 'var(--amber)' : 'var(--t3)' }}>{r.wastage || 0}</td>
              <td style={td}>{r.avg_yield_pct != null ? `${r.avg_yield_pct.toFixed(1)}%` : '—'}</td>
              <td style={td}>{rupees(r.conversion_cost_paise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JobHistory({ jobs, isLoading, onDeleteJob }: { jobs: any[]; isLoading: boolean; onDeleteJob?: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null);

  const filtered = jobs.filter(j => {
    const matchStage = stageFilter === 'all' || j.stage === stageFilter;
    const q = search.toLowerCase();
    const matchSearch = !search
      || j.id?.toLowerCase().includes(q)
      || j.lot_id?.toLowerCase().includes(q)
      || j.stage?.toLowerCase().includes(q)
      || j.status?.toLowerCase().includes(q);
    return matchStage && matchSearch;
  });

  const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700,
    color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '1px solid var(--bd)', background: 'var(--bg2)',
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 12, color: 'var(--t2)', borderBottom: '1px solid var(--bd)',
  };

  function statusColor(s: string) {
    if (s === 'Complete') return 'var(--sage)';
    if (s === 'In Progress') return 'var(--amber)';
    if (s === 'Cancelled') return 'var(--red)';
    return 'var(--t3)';
  }

  function stageBadge(stage: string) {
    const colors: Record<string, string> = {
      split: 'var(--blue)', cut: 'var(--amber)', chipping: 'var(--gold)', polish: 'var(--sage)', done: 'var(--rust)',
    };
    return (
      <span style={{
        background: 'var(--bg2)', color: colors[stage] || 'var(--t3)',
        padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
      }}>{stage}</span>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <StageLossTable />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs…" style={{ ...inputStyle, minWidth: 200 }} />
        <Sel value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="all">All stages</option>
          <option value="split">Split</option>
          <option value="cut">Cut</option>
          <option value="chipping">Chipping</option>
          <option value="polish">Polish</option>
          <option value="done">Done</option>
        </Sel>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--t3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--bd)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr>
                <th style={thStyle}>Job ID</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Lot</th>
                <th style={thStyle}>Stage</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Inputs</th>
                <th style={thStyle}>Outputs</th>
                <th style={thStyle}>Cost</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Damaged</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Wastage</th>
                {onDeleteJob && <th style={{ ...thStyle, textAlign: 'center' }}>Del</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={onDeleteJob ? 11 : 10} style={{ ...tdStyle, textAlign: 'center', color: 'var(--t3)' }}>No jobs found</td></tr>
              ) : (
                filtered.map((j: any) => {
                  const cost = (j.labour_paise || 0) + (j.power_paise || 0) + (j.consumables_paise || 0);
                  const inputsSummary = (j.inputs || []).map((i: any) => `${i.product_id} (${i.qty_consumed})`).join(', ');
                  const outputsSummary = (j.outputs || []).map((o: any) => `${o.product_id} (${o.qty_produced})`).join(', ');
                  const isConfirming = confirmDeleteJobId === j.id;
                  return (
                    <tr key={j.id} style={{ background: isConfirming ? 'rgba(220,50,50,0.06)' : 'var(--bg1)' }}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--t1)', fontFamily: 'monospace', fontSize: 11 }}>{j.id}</td>
                      <td style={tdStyle}>{j.date}</td>
                      <td style={tdStyle}>{j.lot_id}</td>
                      <td style={tdStyle}>{stageBadge(j.stage)}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: statusColor(j.status) }}>{j.status}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: 'var(--t3)', maxWidth: 180 }}>{inputsSummary}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: 'var(--t3)', maxWidth: 180 }}>{outputsSummary}</td>
                      <td style={tdStyle}>{cost > 0 ? `₹${(cost / 100).toLocaleString('en-IN')}` : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: j.damage_count > 0 ? 'var(--red)' : 'var(--t3)' }}>
                        {j.damage_count > 0 ? j.damage_count : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: j.wastage_count > 0 ? 'var(--amber)' : 'var(--t3)' }}>
                        {j.wastage_count > 0 ? j.wastage_count : '—'}
                      </td>
                      {onDeleteJob && (
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {isConfirming ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => { onDeleteJob(j.id); setConfirmDeleteJobId(null); }}
                                style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Yes</button>
                              <button onClick={() => setConfirmDeleteJobId(null)}
                                style={{ background: 'transparent', color: 'var(--t3)', border: '1px solid var(--bd)', borderRadius: 3, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}>No</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteJobId(j.id)} title="Delete this job (restores input stock)"
                              style={{ background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 3, padding: '2px 7px', fontSize: 10, cursor: 'pointer', opacity: 0.7 }}>✕</button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE INVENTORY TABLE
// ─────────────────────────────────────────────────────────────────────────────
const STAGE_META: Record<string, { label: string; color: string; step: string }> = {
  RAW_YARD:      { label: 'Raw Yard',     color: 'var(--rust)',  step: '①' },
  GANGSAW_OUT:   { label: 'Gangsaw Out',  color: 'var(--amber)', step: '③' },
  GANGSAW_IN:    { label: 'Gangsaw In',   color: 'var(--blue)',  step: '②' },
  FINISHED_YARD: { label: 'Finished Yard',color: 'var(--sage)',  step: '④' },
  SHOWROOM:      { label: 'Showroom',     color: 'var(--gold)',  step: '⑤' },
};

function PipelineInventory({ groups, onAction, onDelete }: { groups: Record<string, any[]>; onAction?: (tab: string, productId: string) => void; onDelete?: (id: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(STAGE_META).map(k => [k, true]))
  );
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [damageId, setDamageId] = useState<string | null>(null);
  const [damageForm, setDamageForm] = useState({ qty: '1', reason: 'damage' as 'damage' | 'wastage', notes: '' });
  const updateProduct = useUpdateProduct();
  const recordDamage = useRecordDamage();
  const { notify } = useToastStore();
  const { user } = useAuthStore();
  const canEdit = user?.role === 'admin' || user?.role === 'yard';

  function startEdit(p: any) {
    const d = p.dimensions || {};
    setEditForm({
      lot_id:       p.lot_id || '',
      grade:        p.grade || '',
      stock:        String(p.stock ?? 0),
      rate_rs:      p.rate_paise ? String((p.rate_paise / 100).toFixed(2)) : '',
      length_mm:    d.length_m ? String(Math.round(d.length_m * 100)) : '',
      width_mm:     d.width_m  ? String(Math.round(d.width_m  * 100)) : '',
      height_mm:    d.height_m ? String(Math.round(d.height_m * 100)) : '',
      size_lw:      d.size_lw      || '',
      thickness_mm: d.thickness_mm ? String(d.thickness_mm) : '',
    });
    setEditingId(p.id);
    setConfirmDelete(null);
  }

  function saveEdit(p: any) {
    const ef = editForm;
    const data: Record<string, any> = {
      lot_id:     ef.lot_id  || null,
      grade:      ef.grade   || null,
      stock:      Number(ef.stock),
      rate_paise: ef.rate_rs ? Math.round(Number(ef.rate_rs) * 100) : 0,
    };
    if (p.kind === 'block' && ef.length_mm && ef.width_mm && ef.height_mm) {
      data.dimensions = {
        length_m: Number(ef.length_mm) / 100,
        width_m:  Number(ef.width_mm)  / 100,
        height_m: Number(ef.height_mm) / 100,
      };
    } else if ((p.kind === 'slab' || p.kind === 'cts') && ef.size_lw && ef.thickness_mm) {
      data.dimensions = { size_lw: ef.size_lw, thickness_mm: Number(ef.thickness_mm), sqft: sqftFromSize(ef.size_lw) };
    } else if (p.kind === 'tile' && ef.size_lw && ef.thickness_mm) {
      data.dimensions = { size_lw: ef.size_lw, thickness_mm: Number(ef.thickness_mm), sqft_per_tile: sqftFromSize(ef.size_lw) };
    }
    updateProduct.mutate({ id: p.id, data }, {
      onSuccess: () => { setEditingId(null); notify(`${p.id} updated`, 'success'); },
      onError: (err: any) => notify(err.message || 'Update failed', 'error'),
    });
  }

  const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 700,
    color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.04em',
    background: 'var(--bg2)', borderBottom: '1px solid var(--bd)',
  };
  const tdStyle: React.CSSProperties = {
    padding: '7px 10px', fontSize: 12, color: 'var(--t2)', borderBottom: '1px solid var(--bd)',
    whiteSpace: 'nowrap',
  };

  const stageActions: Record<string, Array<{ label: string; tab: string; color: string }>> = {
    RAW_YARD:      [{ label: 'Split →', tab: 'split', color: 'var(--amber)' }, { label: 'Cut →', tab: 'cut', color: 'var(--rust)' }],
    GANGSAW_IN:    [{ label: 'Cut →',   tab: 'cut',   color: 'var(--rust)' }],
    GANGSAW_OUT:   [{ label: 'Polish →', tab: 'polish', color: 'var(--sage)' }],
    FINISHED_YARD: [{ label: 'Route →', tab: 'route',  color: 'var(--gold)' }],
    SHOWROOM:      [],
  };

  const stageOrder = ['RAW_YARD','GANGSAW_IN','GANGSAW_OUT','FINISHED_YARD','SHOWROOM'];
  const anyData = stageOrder.some(s => (groups[s] || []).length > 0);

  if (!anyData) {
    return (
      <div style={{ ...card, color: 'var(--t3)', fontSize: 13, textAlign: 'center', padding: 28 }}>
        No production inventory yet — register your first block in step 1.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {stageOrder.map(stageKey => {
        const rows = groups[stageKey] || [];
        if (!rows.length) return null;
        const meta = STAGE_META[stageKey];
        const isOpen = open[stageKey] !== false;
        return (
          <div key={stageKey} style={{ border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden' }}>
            {/* Stage header */}
            <div
              onClick={() => setOpen(o => ({ ...o, [stageKey]: !isOpen }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', cursor: 'pointer',
                background: 'var(--bg2)', borderBottom: isOpen ? '1px solid var(--bd)' : 'none',
              }}
            >
              <span style={{ fontSize: 16 }}>{meta.step}</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: meta.color }}>{meta.label}</span>
              <span style={{
                marginLeft: 4, background: meta.color, color: '#fff',
                borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '1px 8px',
              }}>{rows.length} record{rows.length > 1 ? 's' : ''}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--t3)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Product ID</th>
                      <th style={thStyle}>Lot</th>
                      <th style={thStyle}>Kind</th>
                      <th style={thStyle}>Variety</th>
                      <th style={thStyle}>Dimensions</th>
                      <th style={thStyle}>Grade</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Stock</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Rate</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Label</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>Damage</th>
                      {canEdit && <th style={{ ...thStyle, textAlign: 'center' }}>Edit</th>}
                      {onAction && (stageActions[stageKey] || []).length > 0 && <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>}
                      {onDelete && canEdit && <th style={{ ...thStyle, textAlign: 'center' }}>Delete</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p: any) => {
                      const d = p.dimensions || {};
                      let dimStr = '';
                      if (p.kind === 'block') {
                        const lmm = d.length_m ? Math.round(d.length_m * 100) : null;
                        const wmm = d.width_m  ? Math.round(d.width_m  * 100) : null;
                        const hmm = d.height_m ? Math.round(d.height_m * 100) : null;
                        if (lmm && wmm && hmm) {
                          const cft = cftFromM(d.length_m, d.width_m, d.height_m);
                          const cbm = cbmFromM(d.length_m, d.width_m, d.height_m);
                          dimStr = `${lmm}×${wmm}×${hmm} cm · ${volLabel(cft, cbm)}`;
                        }
                      } else if (d.size_lw) {
                        dimStr = `${d.size_lw} · ${d.thickness_mm || '?'}cm`;
                        if (d.sqft)          dimStr += ` · ${d.sqft} sqft`;
                        if (d.sqft_per_tile) dimStr += ` · ${d.sqft_per_tile} sqft/tile`;
                      }
                      const isEditing = editingId === p.id;
                      const isDamaging = damageId === p.id;
                      const colCount = 11
                        + (onAction && (stageActions[stageKey]||[]).length > 0 ? 1 : 0)
                        + (onDelete && canEdit ? 1 : 0)
                        + (canEdit ? 1 : 0);
                      return (
                        <React.Fragment key={p.id}>
                        <tr style={{ background: isEditing ? 'var(--rustW)' : 'var(--bg1)', outline: isEditing ? '1px solid var(--rust)' : 'none' }}>
                          <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: 'var(--t1)', fontWeight: 600 }}>{p.id}</td>
                          <td style={{ ...tdStyle, color: 'var(--gold)', fontWeight: 600 }}>{p.lot_id || '—'}</td>
                          <td style={tdStyle}>
                            <span style={{
                              background: 'var(--bg2)', color: meta.color,
                              padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                            }}>{p.kind}</span>
                          </td>
                          <td style={tdStyle}>{p.variety}</td>
                          <td style={{ ...tdStyle, color: 'var(--t3)', fontSize: 11 }}>{dimStr || '—'}</td>
                          <td style={{ ...tdStyle, fontWeight: 700, color: p.grade === 'A+' ? 'var(--sage)' : p.grade === 'B' ? 'var(--amber)' : 'var(--t2)' }}>
                            {p.grade || '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--t1)' }}>{p.stock}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--t3)' }}>
                            {p.rate_paise ? `₹${(p.rate_paise / 100).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <button onClick={() => printLabel(p)} title="Print QR label" style={{
                              background: 'transparent', border: '1px solid var(--bd)',
                              color: 'var(--t3)', borderRadius: 4, padding: '2px 7px',
                              fontSize: 11, cursor: 'pointer',
                            }}>▤</button>
                          </td>
                          {/* Damage / Wastage write-off */}
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            {isDamaging ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', minWidth: 220 }}>
                                <input type="number" min="1" max={p.stock} value={damageForm.qty} style={{ ...inputStyle, width: 44, padding: '2px 5px', fontSize: 11 }}
                                  onChange={e => setDamageForm(f => ({ ...f, qty: e.target.value }))} />
                                <select value={damageForm.reason} style={{ ...selectStyle, padding: '2px 5px', fontSize: 11 }}
                                  onChange={e => setDamageForm(f => ({ ...f, reason: e.target.value as any }))}>
                                  <option value="damage">Damage</option>
                                  <option value="wastage">Wastage</option>
                                </select>
                                <button onClick={() => {
                                  recordDamage.mutate({ id: p.id, qty: +damageForm.qty, reason: damageForm.reason, notes: damageForm.notes || undefined }, {
                                    onSuccess: (r) => { setDamageId(null); notify(`${damageForm.reason} of ${damageForm.qty} recorded — stock now ${r.new_stock}`, 'success'); },
                                    onError: (err: any) => notify(err.message || 'Failed', 'error'),
                                  });
                                }} style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                                <button onClick={() => setDamageId(null)} style={{ background: 'transparent', color: 'var(--t3)', border: '1px solid var(--bd)', borderRadius: 3, padding: '2px 5px', fontSize: 10, cursor: 'pointer' }}>✕</button>
                              </div>
                            ) : (
                              <button onClick={() => { setDamageId(p.id); setDamageForm({ qty: '1', reason: 'damage', notes: '' }); }}
                                title="Record damage or wastage" style={{ background: 'transparent', border: '1px solid var(--amber)', color: 'var(--amber)', borderRadius: 4, padding: '2px 7px', fontSize: 10, cursor: 'pointer', opacity: 0.8 }}>△</button>
                            )}
                          </td>
                          {canEdit && (
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <button
                              onClick={() => isEditing ? setEditingId(null) : startEdit(p)}
                              title={isEditing ? 'Cancel edit' : 'Edit product'}
                              style={{
                                background: isEditing ? 'var(--rust)' : 'transparent',
                                border: `1px solid ${isEditing ? 'var(--rust)' : 'var(--bd)'}`,
                                color: isEditing ? '#fff' : 'var(--t2)',
                                borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
                              }}
                            >{isEditing ? '✕' : '✎'}</button>
                          </td>
                          )}
                          {onAction && (stageActions[stageKey] || []).length > 0 && (
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                {(stageActions[stageKey] || []).map(({ label, tab, color }) => (
                                  <button key={tab} onClick={() => onAction(tab, p.id)} style={{
                                    background: 'transparent', border: `1px solid ${color}`,
                                    color, borderRadius: 4, padding: '2px 8px',
                                    fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                                  }}>{label}</button>
                                ))}
                              </div>
                            </td>
                          )}
                          {onDelete && canEdit && (
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              {confirmDelete === p.id ? (
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>Remove?</span>
                                  <button
                                    onClick={() => { onDelete(p.id); setConfirmDelete(null); }}
                                    style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                  >Yes</button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    style={{ background: 'var(--bg2)', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
                                  >No</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(p.id)}
                                  title={p.source_job_id ? `Produced by ${p.source_job_id} — delete with care` : 'Remove product'}
                                  style={{
                                    background: 'transparent',
                                    border: `1px solid ${p.source_job_id ? 'var(--amber)' : 'var(--red)'}`,
                                    color: p.source_job_id ? 'var(--amber)' : 'var(--red)',
                                    borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
                                    opacity: 0.7,
                                  }}
                                >✕</button>
                              )}
                            </td>
                          )}
                        </tr>
                        {/* ── Inline edit row ── */}
                        {isEditing && (
                          <tr style={{ background: 'var(--bg2)' }}>
                            <td colSpan={colCount} style={{ padding: '12px 14px', borderBottom: '2px solid var(--rust)' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
                                <div style={fieldStyle}>
                                  <label style={labelStyle}>Lot ID</label>
                                  <input style={{ ...inputStyle, width: 90 }} value={editForm.lot_id}
                                    onChange={e => setEditForm((f: any) => ({ ...f, lot_id: e.target.value }))} />
                                </div>
                                <div style={fieldStyle}>
                                  <label style={labelStyle}>Grade</label>
                                  <select style={{ ...selectStyle, width: 70 }} value={editForm.grade}
                                    onChange={e => setEditForm((f: any) => ({ ...f, grade: e.target.value }))}>
                                    <option value="">—</option>
                                    {['A+','A','B','C'].map(g => <option key={g}>{g}</option>)}
                                  </select>
                                </div>
                                <div style={fieldStyle}>
                                  <label style={labelStyle}>Stock</label>
                                  <input style={{ ...inputStyle, width: 70 }} type="number" min="0" value={editForm.stock}
                                    onChange={e => setEditForm((f: any) => ({ ...f, stock: e.target.value }))} />
                                </div>
                                <div style={fieldStyle}>
                                  <label style={labelStyle}>Rate (₹)</label>
                                  <input style={{ ...inputStyle, width: 90 }} type="number" min="0" step="0.01" value={editForm.rate_rs}
                                    onChange={e => setEditForm((f: any) => ({ ...f, rate_rs: e.target.value }))} />
                                </div>
                                {p.kind === 'block' && (<>
                                  <div style={{ width: 1, background: 'var(--bd)', alignSelf: 'stretch', margin: '0 2px' }} />
                                  {(['length_mm','width_mm','height_mm'] as const).map(k => (
                                    <div key={k} style={fieldStyle}>
                                      <label style={labelStyle}>{k === 'length_mm' ? 'L (cm)' : k === 'width_mm' ? 'W (cm)' : 'H (cm)'}</label>
                                      <input style={{ ...inputStyle, width: 72 }} type="number" min="0" value={editForm[k]}
                                        onChange={e => setEditForm((f: any) => ({ ...f, [k]: e.target.value }))} />
                                    </div>
                                  ))}
                                </>)}
                                {(p.kind === 'slab' || p.kind === 'tile' || p.kind === 'cts') && (<>
                                  <div style={{ width: 1, background: 'var(--bd)', alignSelf: 'stretch', margin: '0 2px' }} />
                                  <div style={fieldStyle}>
                                    <label style={labelStyle}>Size (L×W)</label>
                                    <input style={{ ...inputStyle, width: 110 }} value={editForm.size_lw}
                                      onChange={e => setEditForm((f: any) => ({ ...f, size_lw: e.target.value }))}
                                      placeholder="2600×1600" />
                                  </div>
                                  <div style={fieldStyle}>
                                    <label style={labelStyle}>Thick (cm)</label>
                                    <input style={{ ...inputStyle, width: 70 }} type="number" min="0" value={editForm.thickness_mm}
                                      onChange={e => setEditForm((f: any) => ({ ...f, thickness_mm: e.target.value }))} />
                                  </div>
                                </>)}
                                <div style={{ display: 'flex', gap: 6, marginLeft: 4 }}>
                                  <button
                                    onClick={() => saveEdit(p)}
                                    disabled={updateProduct.isPending}
                                    style={{ background: 'var(--rust)', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                                  >{updateProduct.isPending ? 'Saving…' : 'Save'}</button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    style={{ background: 'var(--bg1)', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: 5, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
                                  >Cancel</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export function ProductionPage() {
  const [tab, setTab] = useState<Tab>('receive');
  const [preselectId, setPreselectId] = useState<string | undefined>();
  const workflowRef = React.useRef<HTMLDivElement>(null);
  const { notify } = useToastStore();
  const { user: currentUser } = useAuthStore();
  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'yard';
  const deleteProduct = useDeleteProduct();
  const deleteJob = useDeleteProductionJob();

  function handleAction(nextTab: string, productId: string) {
    setPreselectId(productId);
    setTab(nextTab as Tab);
    setTimeout(() => workflowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function handleDelete(id: string, force = false) {
    deleteProduct.mutate({ id, force }, {
      onSuccess: () => notify(`${id} removed from inventory`, 'success'),
      onError: (err: any) => {
        if (!force && err.message?.includes('consumed in job')) {
          if (window.confirm(`${id} was consumed in a production job.\n\nForce-delete anyway (admin override)?`)) {
            handleDelete(id, true);
          }
        } else {
          notify(err.message || 'Cannot delete', 'error');
        }
      },
    });
  }

  const { data: rawBlocksData }   = useProducts({ kind: 'block', location: 'RAW_YARD',      minStock: 1 });
  const { data: gangsawOutSlabs } = useProducts({ kind: 'slab',  location: 'GANGSAW_OUT',   minStock: 1 });
  const { data: gangsawOutTiles } = useProducts({ kind: 'tile',  location: 'GANGSAW_OUT',   minStock: 1 });
  // combine for polish step
  const gangsawOutDataProducts = [...(gangsawOutSlabs?.products || []), ...(gangsawOutTiles?.products || [])];
  // alias for pipeline card
  const gangsawOutData = { products: gangsawOutDataProducts };
  const { data: finishedSlabsData } = useProducts({ kind: 'slab',  location: 'FINISHED_YARD', minStock: 1 });
  const { data: finishedTilesData } = useProducts({ kind: 'tile',  location: 'FINISHED_YARD', minStock: 1 });
  const { data: showroomSlabsData } = useProducts({ kind: 'slab',  location: 'SHOWROOM',      minStock: 1 });
  const { data: showroomTilesData } = useProducts({ kind: 'tile',  location: 'SHOWROOM',      minStock: 1 });
  const { data: jobsData, isLoading: jobsLoading } = useProductionJobs({});

  const rawBlocks     = rawBlocksData?.products || [];
  const gangsawSlabs  = gangsawOutData?.products || [];
  const finishedSlabs = [...(finishedSlabsData?.products || []), ...(finishedTilesData?.products || [])];
  const showroomSlabs = [...(showroomSlabsData?.products || []), ...(showroomTilesData?.products || [])];
  const jobs          = jobsData?.jobs          || [];

  // Gate 3 split: polished goods awaiting QA vs those cleared for the sales yard.
  // Only qa_status === 'pending'/'failed' are withheld; passed or untracked flow on.
  const qaPending  = finishedSlabs.filter((p: any) => p.qa_status === 'pending' || p.qa_status === 'failed');
  const saleReady  = finishedSlabs.filter((p: any) => p.qa_status !== 'pending' && p.qa_status !== 'failed');

  // Approved-PO gate (mirrors the API): only blocks whose source PO is approved
  // (or closed), or that have no PO at all, may be consumed into job work. The
  // API rejects the rest — we hide them from the Split/Cut pickers so operators
  // never pick a block that would bounce, and surface a count so they're not lost.
  const { data: prodPosData } = usePurchaseOrders({});
  const approvedPoIds = useMemo(
    () => new Set((prodPosData?.purchase_orders || [])
      .filter((p: any) => p.status === 'approved' || p.status === 'closed')
      .map((p: any) => p.id)),
    [prodPosData]
  );
  const jobEligibleBlocks = useMemo(
    () => rawBlocks.filter((b: any) => !b.po_id || approvedPoIds.has(b.po_id)),
    [rawBlocks, approvedPoIds]
  );
  const blockedBlockCount = rawBlocks.length - jobEligibleBlocks.length;

  const pipelineGroups = useMemo(() => ({
    RAW_YARD:      rawBlocks,
    GANGSAW_OUT:   gangsawSlabs,
    FINISHED_YARD: finishedSlabs,
    SHOWROOM:      showroomSlabs,
  }), [rawBlocks, gangsawSlabs, finishedSlabs, showroomSlabs]);

  const totalDamage  = jobs.reduce((s: number, j: any) => s + (j.damage_count  || 0), 0);
  const totalWastage = jobs.reduce((s: number, j: any) => s + (j.wastage_count || 0), 0);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--t1)' }}>Production</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t3)' }}>Granite processing pipeline — from quarry block to finished slab</p>
      </div>

      {/* Pipeline overview */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Blocks @ Raw Yard"  count={rawBlocks.length}    color="var(--rust)" />
        <StatCard label="Gangsaw Out" count={gangsawSlabs.reduce((s, p) => s + (p.stock || 0), 0)} sub={`${gangsawSlabs.length} batches (slab+tile)`} color="var(--amber)" />
        <StatCard label="Finished Yard"       count={finishedSlabs.reduce((s, p) => s + (p.stock || 0), 0)} sub={`${finishedSlabs.length} batches`} color="var(--sage)" />
        <StatCard label="In Showroom"         count={showroomSlabs.reduce((s, p) => s + (p.stock || 0), 0)} sub={`${showroomSlabs.length} batches`} color="var(--gold)" />
        <StatCard label="Total Jobs"          count={jobs.length} color="var(--blue)" />
        <StatCard label="Damaged (all jobs)"  count={totalDamage}  sub="unplanned broken pieces" color="var(--red)" />
        <StatCard label="Wastage (all jobs)"  count={totalWastage} sub="trim / offcut losses"     color="var(--amber)" />
      </div>

      {/* Pipeline inventory */}
      <PipelineInventory groups={pipelineGroups} onAction={handleAction} onDelete={handleDelete} />

      {/* Workflow tabs — all components stay mounted; CSS display preserves form state */}
      <div ref={workflowRef} style={card}>
        <TabBar active={tab} onChange={t => setTab(t)} />
        <div>
          <div style={{ display: tab === 'receive' ? 'block' : 'none' }}>
            <ReceiveBlock notify={notify} />
          </div>
          <div style={{ display: tab === 'split' ? 'block' : 'none' }}>
            <SplitBlock rawBlocks={jobEligibleBlocks} blockedCount={blockedBlockCount} notify={notify} preselectId={preselectId} />
          </div>
          <div style={{ display: tab === 'cut' ? 'block' : 'none' }}>
            <CutSlabs rawBlocks={jobEligibleBlocks} blockedCount={blockedBlockCount} notify={notify} preselectId={preselectId} />
          </div>
          <div style={{ display: tab === 'chipping' ? 'block' : 'none' }}>
            <Chipping blocks={jobEligibleBlocks} notify={notify} />
          </div>
          <div style={{ display: tab === 'polish' ? 'block' : 'none' }}>
            <PolishGrade gangsawSlabs={gangsawSlabs} notify={notify} preselectId={preselectId} />
          </div>
          <div style={{ display: tab === 'qa' ? 'block' : 'none' }}>
            <QACheck qaPending={qaPending} notify={notify} />
          </div>
          <div style={{ display: tab === 'route' ? 'block' : 'none' }}>
            <RouteToSale finishedSlabs={saleReady} notify={notify} preselectId={preselectId} />
          </div>
          <div style={{ display: tab === 'history' ? 'block' : 'none' }}>
            <JobHistory jobs={jobs} isLoading={jobsLoading} onDeleteJob={canEdit ? (id) => {
              deleteJob.mutate(id, {
                onSuccess: () => notify(`Job ${id} deleted — input stock restored`, 'success'),
                onError: (err: any) => notify(err.message || 'Delete failed', 'error'),
              });
            } : undefined} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductionPage;
