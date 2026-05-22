import { useState, useRef } from 'react';
import { api } from '../utils/api.js';
import { useToastStore } from '../store';

/**
 * Slab photo capture/upload component.
 *
 * Provides:
 *  - Camera capture on mobile (via capture="environment")
 *  - File picker fallback on desktop
 *  - Client-side resize to max 1600px on longest edge
 *  - JPEG compression at quality 0.85
 *  - Preview before upload
 *  - Replace / delete existing photo
 *
 * Props:
 *   slabId        - the slab to attach the photo to
 *   currentPhoto  - existing effective_photo_url (may be null)
 *   photoSource   - 'custom' | 'variety' | null
 *   onUpdated     - callback(newPhotoUrl) after successful upload/delete
 *   canEdit       - boolean, hides buttons if false
 */
export function SlabPhotoCapture({ slabId, currentPhoto, photoSource, onUpdated, canEdit = true }) {
  const { notify } = useToastStore();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please select an image file', 'error');
      return;
    }
    try {
      const resized = await resizeImage(file, 1600, 0.85);
      setPreview({ blob: resized.blob, dataUrl: resized.dataUrl, originalSize: file.size });
    } catch (err) {
      notify('Failed to process image: ' + err.message, 'error');
    }
    e.target.value = '';  // allow re-selecting same file
  }

  async function upload() {
    if (!preview) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', preview.blob, `slab-${slabId}.jpg`);
      // Use fetch directly — our api.js wrapper assumes JSON
      const res = await fetch(`/api/slabs/${encodeURIComponent(slabId)}/photo`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      notify('Photo uploaded', 'success');
      setPreview(null);
      onUpdated?.(data.photo_url);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function deleteExisting() {
    if (!window.confirm('Remove this photo? Variety default will show instead.')) return;
    try {
      await api.delete(`/slabs/${encodeURIComponent(slabId)}/photo`);
      notify('Photo removed', 'success');
      onUpdated?.(null);
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Current photo or preview */}
      {(preview || currentPhoto) && (
        <div style={{ position: 'relative' }}>
          <img
            src={preview?.dataUrl || currentPhoto}
            alt={preview ? 'New photo preview' : 'Current slab photo'}
            style={{
              width: '100%', maxHeight: 200, objectFit: 'cover',
              borderRadius: 4, border: '1px solid var(--bd)',
              background: 'var(--bg3)',
            }}
          />
          {preview && (
            <div style={{
              position: 'absolute', top: 5, left: 5,
              background: 'var(--rustW)', color: 'var(--rust)',
              padding: '2px 6px', borderRadius: 3,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 8, letterSpacing: 1, textTransform: 'uppercase',
            }}>Preview</div>
          )}
          {!preview && photoSource === 'variety' && (
            <div style={{
              position: 'absolute', top: 5, left: 5,
              background: 'var(--bg3)', color: 'var(--t3)',
              padding: '2px 6px', borderRadius: 3,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 8, letterSpacing: 1, textTransform: 'uppercase',
            }}>Default</div>
          )}
        </div>
      )}

      {!canEdit ? null : !preview ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={onFileSelected}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn-s btn-sm"
              style={{ flex: 1 }}
              onClick={() => fileInputRef.current?.click()}
            >
              📷 {currentPhoto && photoSource === 'custom' ? 'Replace' : 'Add Photo'}
            </button>
            {currentPhoto && photoSource === 'custom' && (
              <button
                type="button"
                className="btn btn-s btn-sm"
                onClick={deleteExisting}
                style={{ color: 'var(--rust)' }}
              >✕</button>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn btn-p btn-sm"
            style={{ flex: 1 }}
            onClick={upload}
            disabled={uploading}
          >{uploading ? 'Uploading…' : 'Save Photo'}</button>
          <button
            type="button"
            className="btn btn-s btn-sm"
            onClick={() => setPreview(null)}
            disabled={uploading}
          >Cancel</button>
        </div>
      )}
    </div>
  );
}

/**
 * Resize an image file client-side.
 * Returns { blob, dataUrl } — always JPEG to minimize size over the wire.
 */
async function resizeImage(file, maxEdge, quality) {
  const imgUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(imgUrl);
    const ratio = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob failed')),
                    'image/jpeg', quality);
    });
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return { blob, dataUrl };
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
