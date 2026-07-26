import { Link, useParams } from 'react-router-dom';
import { useProductTrace } from '@/hooks/useApi';
import { formatINR } from '@/utils/format';

export function ProductTracePage() {
  const { id = '' } = useParams();
  const { data, isLoading } = useProductTrace(id, { enabled: !!id });

  if (isLoading) {
    return <div className="page"><p>Loading trace...</p></div>;
  }

  if (!data?.product) {
    return <div className="page"><p>Product trace not found.</p></div>;
  }

  const { product, moves } = data;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: '8px' }}>Product Trace</h1>
          <p style={{ color: 'var(--t3)', fontSize: '13px', marginBottom: 0 }}>
            Live QR trace for yard, showroom, and dispatch movement
          </p>
        </div>
        <Link to="/inventory" className="btn btn-s" style={{ textDecoration: 'none' }}>Back to Inventory</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <TraceCard label="Product ID" value={product.id} mono />
        <TraceCard label="Kind" value={product.kind || '—'} />
        <TraceCard label="Variety" value={product.variety || '—'} />
        <TraceCard label="Current Location" value={product.current_location_name || product.current_location_id || 'Unassigned'} />
        <TraceCard label="Lot" value={product.lot_id || '—'} mono />
        <TraceCard label="Stock" value={`${product.stock ?? 0} ${product.uom || ''}`.trim()} />
      </div>

      <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '8px', padding: '18px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Current Snapshot</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <div><span style={{ color: 'var(--t3)' }}>Rate:</span> <strong>{formatINR(product.rate_paise || 0)}</strong></div>
          <div><span style={{ color: 'var(--t3)' }}>Location Type:</span> <strong>{product.current_location_type || '—'}</strong></div>
          <div><span style={{ color: 'var(--t3)' }}>Grade:</span> <strong>{product.grade || '—'}</strong></div>
          <div><span style={{ color: 'var(--t3)' }}>HSN:</span> <strong>{product.hsn || '—'}</strong></div>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '8px', padding: '18px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Movement History</h3>
        {moves.length === 0 ? (
          <p style={{ color: 'var(--t3)', margin: 0 }}>No movement history recorded yet.</p>
        ) : (
          <div className="tw">
            <table className="dt">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Move</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Qty</th>
                  <th>Stage</th>
                  <th>Job</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((move) => (
                  <tr key={move.id}>
                    <td>{new Date(move.created_at).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{move.move_type}</td>
                    <td>{move.from_location_name || move.from_location_id || '—'}</td>
                    <td>{move.to_location_name || move.to_location_id || '—'}</td>
                    <td>{move.qty}</td>
                    <td>{move.stage || '—'}</td>
                    <td>{move.job_id || '—'}</td>
                    <td>{move.created_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TraceCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '6px', padding: '12px 14px' }}>
      <div style={{ fontSize: '10px', color: 'var(--t3)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--t1)', fontFamily: mono ? "'IBM Plex Mono', monospace" : 'inherit' }}>
        {value}
      </div>
    </div>
  );
}