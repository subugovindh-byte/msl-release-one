import { useEffect, useRef, useState } from 'react';

// ── Guided 360 capture ──────────────────────────────────────────────────────
// Shoots a rotation frame by frame on the device rather than assuming the
// photos already exist somewhere. Two things make a usable spin, and both are
// enforced here rather than left to the photographer:
//
//   • even angular spacing — the target angle is shown for every frame, so
//     the block is turned (or walked around) a fixed step each time;
//   • consistent framing — the previous frame is ghosted over the live preview
//     as an onion skin, so drift is visible before the shutter, not after.
//
// Frames are downscaled on capture: a rotation lives in SQLite as data URIs,
// so full-resolution stills would be tens of megabytes per variety.

const CAPTURE_MAX_PX = 1200;
const CAPTURE_QUALITY = 0.72;

// 24 (every 15 degrees) is the usual shoot, not a rule. Fewer frames means a
// coarser rotation; the server accepts 4-36. The step angle is what matters —
// it is derived from the chosen count so the guidance stays correct.
const FRAME_CHOICES = [4, 8, 12, 16, 24, 36] as const;
const MIN_FRAMES = 4;

export function FrameCapture({
  variety, target: initialTarget = 24, onDone, onCancel,
}: {
  variety: string;
  target?: number;
  onDone: (frames: string[]) => void;
  onCancel: () => void;
}) {
  const [target, setTarget] = useState<number>(initialTarget);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [ghost, setGhost] = useState(true);
  const [retakeAt, setRetakeAt] = useState<number | null>(null);

  const slot = retakeAt ?? frames.length;          // which frame is being shot
  const angle = Math.round((slot * 360) / target);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e: any) {
        setErr(e?.name === 'NotAllowedError'
          ? 'Camera permission denied — allow it, or use file upload instead'
          : 'No camera on this device — use file upload instead');
      }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, CAPTURE_MAX_PX / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', CAPTURE_QUALITY);
    setFrames(f => {
      const next = [...f];
      next[slot] = url;          // same path for a fresh shot and a retake
      return next;
    });
    setRetakeAt(null);
  }

  const shot = frames.filter(Boolean).length;
  const enough = shot >= MIN_FRAMES;
  const complete = shot >= target;
  const prev = slot > 0 ? frames[slot - 1] : undefined;

  const btn = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '8px 14px', background: 'transparent', color: '#fff',
    border: '1px solid rgba(255,255,255,.45)', borderRadius: 6,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', ...extra,
  });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: 520, width: '100%',
      background: '#111', border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', color: '#fff', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>{variety}</strong>
        <span style={{ fontSize: 12, opacity: .75 }}>
          {retakeAt !== null ? `Retaking frame ${retakeAt + 1}` : `Frame ${Math.min(slot + 1, target)} of ${target}`}
          {' · turn to '}{angle}°
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: .75, fontVariantNumeric: 'tabular-nums' }}>{shot}/{target}</span>
        <span style={{ display: 'inline-flex', gap: 3 }} role="group" aria-label="Frames in the rotation">
          {FRAME_CHOICES.map(n => (
            <button
              key={n}
              onClick={() => { setTarget(n); setFrames(f => f.slice(0, n)); setRetakeAt(null); }}
              aria-pressed={target === n}
              title={`${n} frames — every ${Math.round(360 / n)}°`}
              style={btn({
                padding: '6px 9px', fontSize: 12,
                background: target === n ? 'rgba(255,255,255,.22)' : 'transparent',
              })}
            >{n}</button>
          ))}
        </span>
        <button style={btn()} onClick={() => setGhost(g => !g)} aria-pressed={ghost}
                title="Ghost the previous frame over the preview to keep framing steady">
          {ghost ? 'Ghost on' : 'Ghost off'}
        </button>
        <button style={btn()} onClick={onCancel}>Cancel</button>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#000' }}>
        {err ? (
          <div style={{ color: '#fff', padding: 24, fontSize: 13, textAlign: 'center' }}>{err}</div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted
                   style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            {ghost && prev && (
              <img src={prev} alt="" aria-hidden
                   style={{
                     position: 'absolute', inset: 0, width: '100%', height: '100%',
                     objectFit: 'contain', opacity: .3, pointerEvents: 'none',
                   }} />
            )}
            {/* Centre guides: keep the block on the axis or the spin wobbles. */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,.25)' }} />
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,.25)' }} />
            </div>
          </>
        )}
      </div>

      {/* captured strip — tap any frame to retake it */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 10px', overflowX: 'auto', background: '#0b0b0b' }}>
        {Array.from({ length: target }, (_, i) => (
          <button key={i} onClick={() => setRetakeAt(i)} title={`Frame ${i + 1}${frames[i] ? ' — retake' : ''}`}
                  style={{
                    width: 38, height: 30, flexShrink: 0, padding: 0, borderRadius: 3, cursor: 'pointer',
                    border: `1px solid ${i === slot ? '#fff' : 'rgba(255,255,255,.25)'}`,
                    background: frames[i] ? `center/cover url(${frames[i]})` : 'rgba(255,255,255,.06)',
                    color: 'rgba(255,255,255,.5)', fontSize: 9,
                  }}>
            {frames[i] ? '' : i + 1}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#0b0b0b' }}>
        <button onClick={snap} disabled={!!err}
                style={{ ...btn({ flex: 1, padding: '11px 14px', fontSize: 14 }), opacity: err ? .4 : 1 }}>
          {retakeAt !== null ? `Retake frame ${retakeAt + 1}` : `Capture frame ${Math.min(slot + 1, target)}`}
        </button>
        <button onClick={() => onDone(frames.filter(Boolean))} disabled={!enough}
                title={enough
                  ? (complete ? 'Save the rotation' : `Save ${shot} frames — coarser than the ${target} planned`)
                  : `At least ${MIN_FRAMES} frames are needed for a rotation`}
                style={{ ...btn({ padding: '11px 16px', fontSize: 14 }), opacity: enough ? 1 : .4, cursor: enough ? 'pointer' : 'not-allowed' }}>
          Save {shot}/{target}
        </button>
      </div>
    </div>
  );
}
