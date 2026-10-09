import { useState, useEffect, useCallback, useRef } from 'react';

// ── Image viewer ────────────────────────────────────────────────────────────
// Expandable, zoomable, pannable. Varieties can carry two reference shots
// (photo_url = rough block, photo_alt_url = polished slab), so the viewer also
// steps between them — that second image exists in the data but was never
// shown anywhere before.
//
// NOTE: this is not a 360 spin. A spin viewer needs a sequence of ~24-36 frames
// shot around the object; the schema holds at most two stills per variety.

// ── 3D block view ───────────────────────────────────────────────────────────
// A granite block is a cuboid, so it can be shown as one: six faces textured
// with the variety photo, orbited through a full 360. Proportions come from
// measured dimensions when the caller has them, otherwise a default block
// ratio. This is a dimensional visualisation, not photography — the sides show
// the same surface texture, not separately photographed faces.
function Block3D({ src, dims, yaw, pitch }: {
  src: string;
  dims?: { l: number; w: number; h: number };
  yaw: number;
  pitch: number;
}) {
  const d = dims ?? { l: 3.0, w: 2.0, h: 1.9 };     // metres, typical block
  const scale = 300 / Math.max(d.l, d.w, d.h);
  const W = d.l * scale, H = d.h * scale, D = d.w * scale;

  // Faces share one texture; brightness stands in for lighting so the form
  // reads as solid while turning.
  const face = (w: number, h: number, transform: string, bright: number): React.CSSProperties => ({
    position: 'absolute', width: w, height: h,
    left: '50%', top: '50%', margin: `${-h / 2}px 0 0 ${-w / 2}px`,
    backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center',
    filter: `brightness(${bright})`,
    outline: '1px solid rgba(0,0,0,.35)', outlineOffset: -1,
    transform, backfaceVisibility: 'hidden',
  });

  return (
    <div style={{ perspective: 1400, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        position: 'relative', width: W, height: H,
        transformStyle: 'preserve-3d',
        transform: `rotateX(${pitch}deg) rotateY(${yaw}deg)`,
      }}>
        <div style={face(W, H, `translateZ(${D / 2}px)`, 1.0)} />
        <div style={face(W, H, `rotateY(180deg) translateZ(${D / 2}px)`, 0.72)} />
        <div style={face(D, H, `rotateY(90deg) translateZ(${W / 2}px)`, 0.84)} />
        <div style={face(D, H, `rotateY(-90deg) translateZ(${W / 2}px)`, 0.84)} />
        <div style={face(W, D, `rotateX(90deg) translateZ(${H / 2}px)`, 1.12)} />
        <div style={face(W, D, `rotateX(-90deg) translateZ(${H / 2}px)`, 0.6)} />
      </div>
    </div>
  );
}

export function PhotoViewer({
  title, images, startIndex, onClose, dims, inline = false, height = 440,
}: {
  title: string;
  images: { url: string; label: string }[];
  startIndex: number;
  onClose: () => void;
  dims?: { l: number; w: number; h: number };
  /* inline: render as a panel in the page instead of a full-screen overlay. */
  inline?: boolean;
  height?: number;
}) {
  const [idx, setIdx] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  // 360 spin: a frame sequence is scrubbed by horizontal drag. Needs enough
  // frames to read as rotation rather than as a slideshow.
  const SPIN_MIN_FRAMES = 8;
  const canSpin = images.length >= SPIN_MIN_FRAMES;
  const [spin, setSpin] = useState(canSpin);
  const [playing, setPlaying] = useState(false);
  const spinFrom = useRef<{ x: number; i: number } | null>(null);
  // 3D: orbit the block itself. Works from a single photo, so it is available
  // for every variety, unlike frame-sequence spin.
  const [threeD, setThreeD] = useState(false);
  const [orbit, setOrbit] = useState({ yaw: -28, pitch: -16 });
  const orbitFrom = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const reset = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  const zoomTo = useCallback((z: number) => {
    const next = Math.min(6, Math.max(1, +z.toFixed(2)));
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });   // snap back when fully zoomed out
  }, []);
  const step = useCallback((d: number) => {
    if (images.length < 2) return;
    setIdx(i => (i + d + images.length) % images.length);
    reset();
  }, [images.length, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomTo(zoom + 0.5);
      else if (e.key === '-' || e.key === '_') zoomTo(zoom - 0.5);
      else if (e.key === '0') reset();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    // the page behind must not scroll while the viewer owns the screen
    const prev = document.body.style.overflow;
    if (!inline) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      if (!inline) document.body.style.overflow = prev;
    };
  }, [onClose, zoom, zoomTo, reset, step, inline]);

  // Index can drift if the image list ever shrinks; fall back rather than crash.
  useEffect(() => {
    if (!playing) return;
    if (threeD) {
      const t = setInterval(() => setOrbit(o => ({ ...o, yaw: o.yaw + 1.4 })), 32);
      return () => clearInterval(t);
    }
    if (!canSpin) return;
    const t = setInterval(() => setIdx(i => (i + 1) % images.length), 90);
    return () => clearInterval(t);
  }, [playing, canSpin, threeD, images.length]);

  const current = images[idx] ?? images[0];
  if (!current) return null;
  const fg     = inline ? 'var(--t1)' : '#fff';
  const btnBg  = inline ? 'transparent' : 'rgba(255,255,255,.08)';
  const btnBd  = inline ? 'var(--bd)' : 'rgba(255,255,255,.18)';
  const btnOn  = inline ? 'var(--rustW)' : 'rgba(255,255,255,.22)';
  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 34, height: 34, padding: '0 10px',
    background: btnBg, color: fg,
    border: `1px solid ${btnBd}`, borderRadius: 6,
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
  };

  return (
    <div
      role={inline ? 'group' : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-label={`${title} — photo viewer`}
      onClick={inline ? undefined : onClose}
      style={inline ? {
        display: 'flex', flexDirection: 'column',
        height, width: '100%',
        background: 'var(--bg0)',
        border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden',
      } : {
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,.92)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* toolbar */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '10px 12px', color: fg,
          borderBottom: inline ? '1px solid var(--bd)' : 'none',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginRight: 'auto' }}>
          {title}
          <span style={{ opacity: .6, fontWeight: 500, marginLeft: 8, fontSize: 12 }}>
            {current.label}{images.length > 1 ? ` · ${idx + 1}/${images.length}` : ''}
          </span>
        </div>
        <button
          style={{ ...btn, background: threeD ? btnOn : btn.background }}
          onClick={() => { setThreeD(v => !v); setPlaying(false); reset(); }}
          title="Toggle 3D block view"
          aria-pressed={threeD}
        >3D</button>
        {threeD && (
          <button style={btn} onClick={() => setPlaying(p => !p)}
                  aria-label={playing ? 'Stop rotation' : 'Rotate 360'}
                  title={playing ? 'Stop rotation' : 'Rotate 360'}>{playing ? '❚❚' : '▶'}</button>
        )}
        {canSpin && (
          <>
            <button style={{ ...btn, background: spin ? btnOn : btn.background }}
                    onClick={() => { setSpin(v => !v); setPlaying(false); reset(); }}
                    title="Toggle 360 spin">360°</button>
            {spin && (
              <button style={btn} onClick={() => setPlaying(p => !p)}
                      aria-label={playing ? 'Pause rotation' : 'Play rotation'}
                      title={playing ? 'Pause rotation' : 'Play rotation'}>{playing ? '❚❚' : '▶'}</button>
            )}
          </>
        )}
        {images.length > 1 && (
          <>
            <button style={btn} onClick={() => step(-1)} aria-label="Previous view" title="Previous view (←)">‹</button>
            <button style={btn} onClick={() => step(1)} aria-label="Next view" title="Next view (→)">›</button>
          </>
        )}
        <button style={btn} onClick={() => zoomTo(zoom - 0.5)} aria-label="Zoom out" title="Zoom out (−)">−</button>
        <button style={{ ...btn, minWidth: 58, fontVariantNumeric: 'tabular-nums' }}
                onClick={reset} title="Reset to fit (0)">{Math.round(zoom * 100)}%</button>
        <button style={btn} onClick={() => zoomTo(zoom + 0.5)} aria-label="Zoom in" title="Zoom in (+)">+</button>
        <button style={btn} onClick={onClose}
                aria-label={inline ? 'Collapse' : 'Close viewer'}
                title={inline ? 'Collapse (Esc)' : 'Close (Esc)'}>✕</button>
      </div>

      {/* stage */}
      <div
        onClick={e => e.stopPropagation()}
        onWheel={e => zoomTo(zoom + (e.deltaY < 0 ? 0.3 : -0.3))}
        onDoubleClick={() => (zoom > 1 ? reset() : zoomTo(2))}
        onPointerDown={e => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          if (threeD) {
            setPlaying(false);
            orbitFrom.current = { x: e.clientX, y: e.clientY, yaw: orbit.yaw, pitch: orbit.pitch };
            return;
          }
          if (spin && zoom === 1) { setPlaying(false); spinFrom.current = { x: e.clientX, i: idx }; return; }
          if (zoom === 1) return;
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        }}
        onPointerMove={e => {
          if (orbitFrom.current) {
            const o = orbitFrom.current;
            setOrbit({
              yaw: o.yaw + (e.clientX - o.x) * 0.5,
              // clamp pitch so the block never flips past vertical
              pitch: Math.max(-80, Math.min(80, o.pitch + (e.clientY - o.y) * 0.3)),
            });
            return;
          }
          if (spinFrom.current) {
            // ~28px of travel per frame: slow enough to land on a frame,
            // fast enough that one swipe crosses the whole rotation.
            const delta = Math.round((e.clientX - spinFrom.current.x) / 28);
            setIdx(((spinFrom.current.i + delta) % images.length + images.length) % images.length);
            return;
          }
          if (!drag.current) return;
          setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
        }}
        onPointerUp={() => { drag.current = null; spinFrom.current = null; orbitFrom.current = null; }}
        style={{
          flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', touchAction: 'none',
          cursor: threeD ? 'grab' : spin && zoom === 1 ? 'ew-resize' : zoom > 1 ? (drag.current ? 'grabbing' : 'grab') : 'zoom-in',
        }}
      >
        {threeD ? (
          <Block3D src={current.url} dims={dims} yaw={orbit.yaw} pitch={orbit.pitch} />
        ) : (
        <img
          src={current.url}
          alt={`${title} — ${current.label}`}
          draggable={false}
          style={{
            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: drag.current ? 'none' : 'transform .16s ease-out',
            userSelect: 'none',
          }}
        />
        )}
      </div>

      <div onClick={e => e.stopPropagation()}
           style={{ padding: inline ? '6px 12px 10px' : '8px 16px 14px',
                    color: inline ? 'var(--t3)' : 'rgba(255,255,255,.5)',
                    fontSize: 11, textAlign: 'center' }}>
        {threeD
          ? 'drag to orbit the block · ▶ to rotate 360° · Esc to close'
          : canSpin && spin
            ? 'drag left/right to rotate · ▶ to auto-spin · scroll to zoom · Esc to close'
            : 'scroll or +/− to zoom · drag to pan · double-click to toggle · Esc to close'}
      </div>
    </div>
  );
}

// Drop-in replacement for <img> that opens the viewer on click, so every photo
// in the app behaves the same way. Pass `images` for a variety with more than
// one reference shot; otherwise the single src is used.
// Not for QR codes or print templates — those are utility graphics, not photos.
export function ZoomableImage({
  src, alt, title, images, style, className, fill = true,
}: {
  src: string;
  alt: string;
  title?: string;
  images?: { url: string; label: string }[];
  style?: React.CSSProperties;
  className?: string;
  fill?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const list = images && images.length ? images : [{ url: src, label: alt || 'Photo' }];
  const name = title || alt || 'photo';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`View ${name} larger`}
        aria-label={`View ${name} larger`}
        style={{
          padding: 0, border: 'none', background: 'none', cursor: 'zoom-in',
          display: 'block', lineHeight: 0,
          width: fill ? '100%' : undefined, height: fill ? '100%' : undefined,
        }}
      >
        <img src={src} alt={alt} className={className}
             style={{ display: 'block', ...(fill ? { width: '100%', height: '100%', objectFit: 'cover' } : {}), ...style }} />
      </button>
      {open && (
        <PhotoViewer title={name} images={list} startIndex={0} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
