/**
 * Lightweight multipart/form-data parser.
 * Handles single-file uploads (the only shape we need for photos).
 *
 * Populates:
 *   req.file   = { buffer, mimetype, filename, size }
 *   req.body   = { ...other form fields }
 *
 * Size cap via options.maxBytes (default 6 MB to leave headroom over 5 MB photo cap).
 * Content-type must start with 'multipart/form-data' or we fall through.
 */
export function multipart(options = {}) {
  const maxBytes = options.maxBytes || 6 * 1024 * 1024;

  return (req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (!ct.startsWith('multipart/form-data')) return next();

    const boundaryMatch = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if (!boundaryMatch) return next(new Error('No multipart boundary'));
    const boundary = Buffer.from('--' + (boundaryMatch[1] || boundaryMatch[2]));

    const chunks = [];
    let total = 0;
    let aborted = false;

    req.on('data', c => {
      if (aborted) return;
      total += c.length;
      if (total > maxBytes) {
        aborted = true;
        res.status(413).json({ error: 'Payload too large', code: 'TOO_LARGE' });
        req.destroy();
        return;
      }
      chunks.push(c);
    });

    req.on('end', () => {
      if (aborted) return;
      try {
        const body = Buffer.concat(chunks);
        const parts = splitByBoundary(body, boundary);
        req.body = {};
        for (const part of parts) {
          const { headers, content } = parsePart(part);
          const cd = headers['content-disposition'];
          if (!cd) continue;
          const nameMatch = cd.match(/name="([^"]+)"/);
          const filenameMatch = cd.match(/filename="([^"]+)"/);
          if (!nameMatch) continue;
          const name = nameMatch[1];

          if (filenameMatch) {
            // It's a file
            req.file = {
              fieldname: name,
              filename: filenameMatch[1],
              mimetype: headers['content-type'] || 'application/octet-stream',
              buffer: content,
              size: content.length,
            };
          } else {
            // It's a regular field
            req.body[name] = content.toString('utf8');
          }
        }
        next();
      } catch (err) {
        next(err);
      }
    });

    req.on('error', next);
  };
}

function splitByBoundary(body, boundary) {
  const parts = [];
  let start = body.indexOf(boundary);
  if (start < 0) return parts;
  start += boundary.length;
  while (true) {
    const end = body.indexOf(boundary, start);
    if (end < 0) break;
    // Skip leading \r\n after boundary, trailing \r\n before next boundary
    let partStart = start;
    if (body[partStart] === 0x0d && body[partStart + 1] === 0x0a) partStart += 2;
    let partEnd = end;
    if (body[partEnd - 2] === 0x0d && body[partEnd - 1] === 0x0a) partEnd -= 2;
    parts.push(body.slice(partStart, partEnd));
    start = end + boundary.length;
  }
  return parts;
}

function parsePart(part) {
  const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
  if (headerEnd < 0) return { headers: {}, content: Buffer.alloc(0) };
  const headerStr = part.slice(0, headerEnd).toString('utf8');
  const content = part.slice(headerEnd + 4);
  const headers = {};
  for (const line of headerStr.split('\r\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    headers[line.slice(0, idx).toLowerCase().trim()] = line.slice(idx + 1).trim();
  }
  return { headers, content };
}
