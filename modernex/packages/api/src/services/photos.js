import { BlobServiceClient } from '@azure/storage-blob';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Photo storage — separate from DB backups.
 *
 * Container: AZURE_PHOTOS_CONTAINER (default 'modernex-photos')
 * Path scheme: slabs/<slab_id>/<uuid>.<ext>
 *
 * Retention: permanent (no lifecycle policy). Delete-on-replace.
 * Access: private; served via short-lived SAS URL on read.
 *
 * Security constraints enforced here:
 *  - MIME must be image/jpeg, image/png, or image/webp
 *  - Magic-byte sniff to prevent MIME spoofing
 *  - Size hard cap: 5 MB after client-side resize
 *  - EXIF preserved (camera direction useful for print orientation)
 */

const CONTAINER = process.env.AZURE_PHOTOS_CONTAINER || 'modernex-photos';
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Magic byte signatures (first bytes of file)
const MAGIC = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png':  [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],   // RIFF header; full validation includes 'WEBP' at offset 8
};

function validateImageBytes(buffer, claimedMime) {
  if (!ALLOWED_MIMES.has(claimedMime)) {
    throw new Error(`Unsupported image type: ${claimedMime}`);
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error(`Image too large: ${buffer.length} bytes (max ${MAX_BYTES})`);
  }
  const signatures = MAGIC[claimedMime];
  const ok = signatures.some(sig =>
    sig.every((byte, i) => buffer[i] === byte)
  );
  if (!ok) throw new Error('File bytes do not match declared image type');

  // Additional WEBP check — needs 'WEBP' at offset 8
  if (claimedMime === 'image/webp') {
    const webpMark = buffer.slice(8, 12).toString('ascii');
    if (webpMark !== 'WEBP') throw new Error('Invalid WEBP file');
  }
}

function getBlobService() {
  if (!config.azure.blobConnection) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING not configured');
  }
  return BlobServiceClient.fromConnectionString(config.azure.blobConnection);
}

/**
 * Upload a photo for a specific slab.
 * @param {string} slabId
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {Promise<{url:string, path:string, size:number}>}
 */
export async function uploadSlabPhoto(slabId, buffer, mimeType) {
  validateImageBytes(buffer, mimeType);

  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType];
  const id = crypto.randomUUID();
  const path = `slabs/${slabId}/${id}.${ext}`;

  // Dev fallback — if no Azure conn, return a data: URL so local dev still works
  if (!config.azure.blobConnection) {
    const b64 = buffer.toString('base64');
    const url = `data:${mimeType};base64,${b64}`;
    logger.warn({ slabId, size: buffer.length }, 'Photo embedded as data URL (no Azure conn)');
    return { url, path: `local://${path}`, size: buffer.length };
  }

  const service = getBlobService();
  const container = service.getContainerClient(CONTAINER);
  await container.createIfNotExists({ access: 'private' });

  const blob = container.getBlockBlobClient(path);
  await blob.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: mimeType,
      blobCacheControl: 'public, max-age=31536000, immutable',
    },
    metadata: {
      slabId,
      uploadedAt: new Date().toISOString(),
    },
  });

  // Public URL requires container-level public read, which we don't want.
  // Instead, construct a URL that routes through our API proxy endpoint
  // (GET /api/photos/slab/:slabId → fetches from Blob with server creds).
  const url = `/api/photos/${encodeURIComponent(path)}`;

  logger.info({ slabId, path, size: buffer.length }, 'Slab photo uploaded');
  return { url, path, size: buffer.length };
}

/**
 * Delete a photo blob by its stored path.
 */
export async function deletePhoto(path) {
  if (!path) return;
  if (path.startsWith('local://') || path.startsWith('data:')) return;  // nothing to delete

  if (!config.azure.blobConnection) return;

  try {
    const service = getBlobService();
    const container = service.getContainerClient(CONTAINER);
    const blob = container.getBlockBlobClient(path);
    await blob.deleteIfExists();
    logger.info({ path }, 'Photo deleted');
  } catch (err) {
    logger.warn({ err: err.message, path }, 'Photo delete failed');
  }
}

/**
 * Stream a photo blob back through the API (so we don't need to expose
 * the container publicly or issue SAS tokens).
 */
export async function streamPhoto(path, res) {
  if (path.startsWith('data:')) {
    throw new Error('Cannot stream data: URL');
  }
  if (!config.azure.blobConnection) {
    throw new Error('Photo blob storage not configured');
  }

  const service = getBlobService();
  const container = service.getContainerClient(CONTAINER);
  const blob = container.getBlockBlobClient(path);

  const props = await blob.getProperties();
  res.setHeader('Content-Type', props.contentType || 'image/jpeg');
  res.setHeader('Content-Length', props.contentLength);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const dl = await blob.download();
  dl.readableStreamBody.pipe(res);
}

/**
 * Upload a default photo for a whole variety (shown when slab has none).
 */
export async function uploadVarietyPhoto(variety, buffer, mimeType) {
  validateImageBytes(buffer, mimeType);

  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType];
  const path = `varieties/${variety.replace(/\s+/g, '-').toLowerCase()}.${ext}`;

  if (!config.azure.blobConnection) {
    const b64 = buffer.toString('base64');
    return { url: `data:${mimeType};base64,${b64}`, path: `local://${path}`, size: buffer.length };
  }

  const service = getBlobService();
  const container = service.getContainerClient(CONTAINER);
  await container.createIfNotExists({ access: 'private' });
  const blob = container.getBlockBlobClient(path);
  await blob.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: mimeType,
      blobCacheControl: 'public, max-age=86400',
    },
  });

  return { url: `/api/photos/${encodeURIComponent(path)}`, path, size: buffer.length };
}
