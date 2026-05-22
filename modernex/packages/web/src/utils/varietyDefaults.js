import { useEffect, useState } from 'react';
import { api } from './api.js';

// Singleton cache so multiple components don't refetch
let _cache = null;
let _inflight = null;

export function getVarietyDefaultsCache() {
  return _cache;
}

export function useVarietyDefaults() {
  const [map, setMap] = useState(_cache?.map || {});
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) return;
    if (!_inflight) {
      _inflight = api.get('/variety-defaults').catch(() => ({ varieties: [], map: {} }));
    }
    _inflight.then(data => {
      _cache = data;
      setMap(data.map || {});
      setLoading(false);
    });
  }, []);

  return { map, loading };
}

// Resolve photo URL for a product:
//   1) per-product custom photo (product.photo_url)
//   2) variety reference photo (from defaults map)
//   3) null (caller can render an SVG placeholder)
export function resolveProductPhoto(product, varietyMap) {
  if (product?.photo_url) return product.photo_url;
  const def = varietyMap?.[product?.variety];
  if (def?.photo_url) return def.photo_url;
  return null;
}
