import { useState, useEffect } from 'react';
import { useAuthStore, useToastStore } from '@/store';
import { api } from '@/utils/api';

interface VarietyDefault {
  variety: string;
  region: string;
  photo_url: string | null;
  photo_alt_url: string | null;
  source: string;
  notes: string | null;
}

export function VarietyPhotosPage() {
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
          padding: '12px 16px',
          backgroundColor: 'var(--bg3)',
          border: '1px solid var(--bd)',
          borderRadius: '6px',
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
              color: regionFilter === 'all' ? 'white' : 'var(--t2)',
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
                color: regionFilter === region ? 'white' : 'var(--t2)',
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
              gap: '12px'
            }}
          >
            {/* Photo */}
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
                <img
                  src={variety.photo_url}
                  alt={variety.variety}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: '12px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📷</div>
                  <div>No photo</div>
                </div>
              )}
            </div>

            {/* Info */}
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700 }}>
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

            {/* Upload Button */}
            {canUpload && (
              <div>
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
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '8px 16px',
                    backgroundColor: uploading === variety.variety ? 'var(--bg3)' : 'var(--rust)',
                    color: uploading === variety.variety ? 'var(--t3)' : 'white',
                    borderRadius: '4px',
                    cursor: uploading === variety.variety ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  {uploading === variety.variety ? 'Uploading...' : '📤 Upload Photo'}
                </label>
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
