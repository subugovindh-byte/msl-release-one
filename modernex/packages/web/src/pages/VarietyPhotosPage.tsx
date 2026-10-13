import { useState, useEffect } from 'react';
import { useAuthStore, useToastStore } from '@/store';
import { api } from '@/utils/api';
import { PhotoViewer } from '@/components/PhotoViewer';
import { FrameCapture } from '@/components/FrameCapture';

interface VarietyDefault {
  variety: string;
  region: string;
  photo_url: string | null;
  photo_alt_url: string | null;
  source: string;
  notes: string | null;
  frame_count?: number;
}

// ── Peppercorn symbol set ───────────────────────────────────────────────────
// Modern line icons on a 24px grid, 1.6 stroke, round caps — drawn rather than
// taken from Unicode so they share one optical weight. Each keeps the round
// peppercorn silhouette of the concept. They stroke with currentColor, so a
// button's colour and disabled state carry straight through.
const ico = {
  width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.6,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

// ● upload — peppercorn with an upward stem
const IconUpload = () => (
  <svg {...ico}><circle cx="12" cy="12" r="9" /><path d="M12 16V9" /><path d="M9 11.5 12 8.5l3 3" /></svg>
);
// ◐ replace — peppercorn mid-rotation
const IconReplace = () => (
  <svg {...ico}><path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01" /><path d="M20.5 4.5V10h-5.5" /></svg>
);
// remove — minimal bin. Deliberately NOT a circle: the destructive action is
// the one control that should not read as another peppercorn.
const IconRemove = () => (
  <svg {...ico}>
    <path d="M4.5 7h15" />
    <path d="M9.75 7V5.6A1.6 1.6 0 0 1 11.35 4h1.3A1.6 1.6 0 0 1 14.25 5.6V7" />
    <path d="M6.75 7l.72 11.1A2 2 0 0 0 9.46 20h5.08a2 2 0 0 0 2-1.9L17.25 7" />
    <path d="M10.4 10.8v5.4M13.6 10.8v5.4" />
  </svg>
);
// ◌ empty — unground peppercorn, nothing in the mill yet
const IconEmpty = () => (
  <svg {...ico} width="34" height="34" strokeWidth="1.2">
    <circle cx="12" cy="12" r="9" strokeDasharray="2.4 3.2" />
    <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" opacity="0.5" />
  </svg>
);
// ◔ uploading
const IconBusy = () => (
  <svg {...ico}><circle cx="12" cy="12" r="9" opacity="0.35" /><path d="M21 12a9 9 0 0 0-9-9" /></svg>
);

// Ghost control: no fill, hairline border, symbol only. Each carries a title
// and aria-label, since an icon-only button has no accessible name otherwise.
const ghostBtn = (tone: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, flexShrink: 0,
  background: 'transparent', color: tone,
  border: '1px solid var(--bd)', borderRadius: 6, cursor: 'pointer',
  transition: 'border-color .18s, color .18s',
});


// A 24-frame shoot straight off a phone is ~70 MB. Frames live in SQLite as
// data URIs, so each one is downscaled and re-encoded before upload: ~1200px
// JPEG lands around 150 KB, which keeps a full rotation near 4 MB.
const FRAME_MAX_PX = 1200;
const FRAME_QUALITY = 0.72;
const MIN_SPIN_FRAMES = 4;

function downscaleToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, FRAME_MAX_PX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', FRAME_QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name}`)); };
    img.src = url;
  });
}

export function VarietyPhotosPage() {
  // Which card is expanded in place. The viewer renders inside the grid
  // rather than over it, so the rest of the library stays visible.
  const [expanded, setExpanded] = useState<string | null>(null);
  // Frames are fetched only for the card being expanded — the listing carries
  // a count, not the images.
  const [frames, setFrames] = useState<Record<string, string[]>>({});
  const [framesBusy, setFramesBusy] = useState<string | null>(null);
  // Which variety is mid-capture. Live camera, one frame at a time.
  const [capturing, setCapturing] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || frames[expanded]) return;
    let cancelled = false;
    api.get(`/variety-defaults/${encodeURIComponent(expanded)}/frames`)
      .then((r: any) => { if (!cancelled) setFrames(f => ({ ...f, [expanded]: r.frames || [] })); })
      .catch(() => { if (!cancelled) setFrames(f => ({ ...f, [expanded]: [] })); });
    return () => { cancelled = true; };
  }, [expanded, frames]);

  async function saveFrames(variety: string, encoded: string[]) {
    setFramesBusy(variety);
    try {
      await api.put(`/variety-defaults/${encodeURIComponent(variety)}/frames`, { frames: encoded });
      setFrames(f => ({ ...f, [variety]: encoded }));
      notify(`${encoded.length} frames saved for ${variety}`, 'success');
      loadVarieties();
    } catch (e: any) {
      notify(e?.message || 'Frame upload failed', 'error');
    } finally {
      setFramesBusy(null);
    }
  }

  async function uploadFrames(variety: string, files: FileList) {
    const list = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (list.length < MIN_SPIN_FRAMES) {
      notify(`A rotation needs at least ${MIN_SPIN_FRAMES} frames — you selected ${list.length}`, 'error');
      return;
    }
    setFramesBusy(variety);
    try {
      const encoded = await Promise.all(list.map(downscaleToDataUrl));
      await saveFrames(variety, encoded);
    } catch (e: any) {
      notify(e?.message || 'Could not read those images', 'error');
      setFramesBusy(null);
    }
  }
  const { user } = useAuthStore();
  const { notify } = useToastStore();
  const [varieties, setVarieties] = useState<VarietyDefault[]>([]);
  const [loading, setLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [uploading, setUploading] = useState<string | null>(null);

  const canUpload = user?.role === 'admin' || user?.role === 'sales' || user?.role === 'yard' ||
    (user?.roles ?? []).some((r: any) => ['admin', 'sales', 'yard'].includes(r.name ?? r));

  useEffect(() => {
    loadVarieties();
  }, []);

  const loadVarieties = async () => {
    try {
      const response = await api.get<{ varieties: VarietyDefault[] }>('/variety-defaults');
      setVarieties(response.varieties || []);
    } catch (error: any) {
      notify(error.message || 'Failed to load varieties', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPhoto = async (variety: string, file: File) => {
    if (!canUpload) {
      notify('You do not have permission to upload photos', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      notify('File too large (max 5MB)', 'error');
      return;
    }

    setUploading(variety);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const dataUri = e.target?.result as string;
          await api.patch(`/variety-defaults/${encodeURIComponent(variety)}`, {
            photo_url: dataUri,
          });
          notify(`Photo updated for ${variety}`, 'success');
          await loadVarieties();
        } catch (error: any) {
          notify(error.message || 'Upload failed', 'error');
        } finally {
          setUploading(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      notify(error.message || 'Upload failed', 'error');
      setUploading(null);
    }
  };

  const handleDeletePhoto = async (variety: string) => {
    if (!confirm(`Remove reference photo for "${variety}"?`)) return;
    try {
      await api.delete(`/variety-defaults/${encodeURIComponent(variety)}/photo`);
      notify(`Photo removed for ${variety}`, 'success');
      await loadVarieties();
    } catch (error: any) {
      notify(error.message || 'Delete failed', 'error');
    }
  };

  const filteredVarieties = regionFilter === 'all' 
    ? varieties 
    : varieties.filter(v => v.region === regionFilter);

  const regions = Array.from(new Set(varieties.map(v => v.region))).sort();

  if (loading) {
    return (
      <div className="page">
        <h1>Variety Photo Library</h1>
        <p>Loading varieties...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ marginBottom: '8px' }}>Variety Photo Library</h1>
        <p style={{ color: 'var(--t3)', fontSize: '13px', marginBottom: '0' }}>
          Reference photos for granite varieties. These photos are used across the system when products don't have custom photos.
        </p>
      </div>

      {!canUpload && (
        <div style={{
          marginBottom: '20px',
          fontSize: '13px',
          color: 'var(--t2)'
        }}>
          <strong>View Only:</strong> Admin, Sales, or Yard role required to upload photos.
        </div>
      )}

      {/* Region Filter */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <label style={{ fontWeight: 600, fontSize: '14px' }}>Region:</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setRegionFilter('all')}
            style={{
              padding: '6px 16px',
              borderRadius: '4px',
              border: '1px solid var(--bd)',
              backgroundColor: regionFilter === 'all' ? 'var(--rust)' : 'transparent',
              color: regionFilter === 'all' ? 'var(--on-primary)' : 'var(--t2)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all 0.2s'
            }}
          >
            All ({varieties.length})
          </button>
          {regions.map(region => (
            <button
              key={region}
              onClick={() => setRegionFilter(region)}
              style={{
                padding: '6px 16px',
                borderRadius: '4px',
                border: '1px solid var(--bd)',
                backgroundColor: regionFilter === region ? 'var(--rust)' : 'transparent',
                color: regionFilter === region ? 'var(--on-primary)' : 'var(--t2)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              {region} ({varieties.filter(v => v.region === region).length})
            </button>
          ))}
        </div>
      </div>

      {/* Varieties Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '20px'
      }}>
        {filteredVarieties.map(variety => (
          <div
            key={variety.variety}
            style={{
              backgroundColor: 'var(--bg2)',
              border: '1px solid var(--bd)',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              gridColumn: (expanded === variety.variety || capturing === variety.variety) ? '1 / -1' : undefined,
            }}
          >
            {/* Photo — expands in place into the viewer */}
            {capturing === variety.variety ? (
              <FrameCapture
                variety={variety.variety}
                onCancel={() => setCapturing(null)}
                onDone={async (f) => { setCapturing(null); await saveFrames(variety.variety, f); }}
              />
            ) : expanded === variety.variety && variety.photo_url ? (
              <PhotoViewer
                inline
                height={460}
                title={variety.variety}
                images={
                  // A full rotation supersedes the two stills: with 8+ frames
                  // the viewer switches itself into spin mode.
                  (frames[variety.variety]?.length ?? 0) >= MIN_SPIN_FRAMES
                    ? frames[variety.variety]!.map((url, i) => ({ url, label: `Frame ${i + 1}` }))
                    : [
                        { url: variety.photo_url, label: 'Rough block' },
                        ...(variety.photo_alt_url ? [{ url: variety.photo_alt_url, label: 'Polished slab' }] : []),
                      ]
                }
                startIndex={0}
                onClose={() => setExpanded(null)}
              />
            ) : (
            <div style={{
              width: '100%',
              height: '180px',
              backgroundColor: 'var(--bg3)',
              border: '2px dashed var(--bd)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden'
            }}>
              {variety.photo_url ? (
                /* The tile is the affordance: click (or Enter) expands this
                   card in place into the viewer — no overlay. */
                <button
                  type="button"
                  onClick={() => setExpanded(variety.variety)}
                  title={`Expand ${variety.variety}`}
                  aria-label={`Expand ${variety.variety}`}
                  aria-expanded={expanded === variety.variety}
                  style={{
                    width: '100%', height: '100%', padding: 0,
                    border: 'none', background: 'none', cursor: 'zoom-in', display: 'block',
                  }}
                >
                  <img
                    src={variety.photo_url}
                    alt={variety.variety}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </button>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: '12px' }}>
                  <div style={{ marginBottom: '8px', color: 'var(--t3)', lineHeight: 0 }}>
                    <IconEmpty />
                  </div>
                  <div>No photo</div>
                </div>
              )}
            </div>
            )}

            {/* Info */}
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontWeight: 700 }}>
                {variety.variety}
              </h3>
              <div style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                fontSize: '11px',
                color: 'var(--t3)',
                marginBottom: '8px'
              }}>
                <span style={{
                  padding: '2px 8px',
                  backgroundColor: 'var(--bg3)',
                  color: 'var(--t2)',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '10px'
                }}>
                  {variety.region}
                </span>
                <span style={{
                  padding: '2px 8px',
                  backgroundColor: 'var(--bg3)',
                  color: 'var(--t2)',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '10px'
                }}>
                  {variety.source === 'uploaded' ? 'Custom' : 'Reference'}
                </span>
                {(variety.frame_count ?? 0) >= MIN_SPIN_FRAMES && (
                  <span style={{
                    padding: '2px 8px', backgroundColor: 'var(--bg3)', color: 'var(--t1)',
                    borderRadius: '10px', fontWeight: 700, fontSize: '10px',
                  }} title={`${variety.frame_count} frames — 360 rotation available`}>
                    360°
                  </span>
                )}
              </div>
              {variety.notes && (
                <p style={{
                  margin: '0',
                  fontSize: '12px',
                  color: 'var(--t3)',
                  lineHeight: '1.4'
                }}>
                  {variety.notes}
                </p>
              )}
            </div>

            {/* Upload + Delete Buttons */}
            {canUpload && (
              <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
                <input
                  type="file"
                  accept="image/*"
                  id={`upload-${variety.variety}`}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleUploadPhoto(variety.variety, file);
                    }
                  }}
                  disabled={uploading === variety.variety}
                />
                <label
                  htmlFor={`upload-${variety.variety}`}
                  title={variety.photo_url ? 'Replace photo' : 'Upload photo'}
                  aria-label={variety.photo_url ? 'Replace photo' : 'Upload photo'}
                  style={{
                    ...ghostBtn(uploading === variety.variety ? 'var(--t3)' : 'var(--t1)'),
                    cursor: uploading === variety.variety ? 'not-allowed' : 'pointer',
                  }}
                >
                  {uploading === variety.variety
                    ? <IconBusy />
                    : (variety.photo_url ? <IconReplace /> : <IconUpload />)}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  id={`frames-${variety.variety}`}
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.length) uploadFrames(variety.variety, e.target.files); e.target.value = ''; }}
                  disabled={framesBusy === variety.variety}
                />
                <button
                  type="button"
                  onClick={() => { setExpanded(null); setCapturing(variety.variety); }}
                  title={`Shoot a 360 rotation of ${variety.variety} frame by frame`}
                  aria-label={`Capture 360 frames for ${variety.variety}`}
                  style={{ ...ghostBtn('var(--t1)'), width: 'auto', padding: '0 10px', fontSize: 11, fontWeight: 700 }}
                >
                  ⃝360
                </button>
                <label
                  htmlFor={`frames-${variety.variety}`}
                  title={`Upload a 360 rotation (${MIN_SPIN_FRAMES}+ frames) for ${variety.variety}`}
                  aria-label={`Upload 360 frames for ${variety.variety}`}
                  style={{
                    ...ghostBtn(framesBusy === variety.variety ? 'var(--t3)' : 'var(--t1)'),
                    width: 'auto', padding: '0 10px', fontSize: 11, fontWeight: 700, gap: 6,
                    cursor: framesBusy === variety.variety ? 'wait' : 'pointer',
                  }}
                >
                  {/* "+360" not "360°": the badge on the card already reads
                      "360°", and an upload control that looks identical to a
                      status badge is unreadable. */}
                  {framesBusy === variety.variety ? '…' : '+360'}
                </label>
                {variety.photo_url && user?.role === 'admin' && (
                  <button
                    onClick={() => handleDeletePhoto(variety.variety)}
                    title="Remove photo"
                    aria-label="Remove photo"
                    style={ghostBtn('var(--red)')}
                  >
                    <IconRemove />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredVarieties.length === 0 && (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: 'var(--t3)',
          fontSize: '14px'
        }}>
          No varieties found for this region.
        </div>
      )}

    </div>
  );
}
