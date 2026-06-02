import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { useProducts, useUpdateProduct, useDeleteProduct } from '@/hooks/useApi';
import { useAuthStore } from '@/store';
import { DataGridTable } from '@/components/DataGridTable';
import { useViewport } from '@/hooks/useViewport';
import { formatINR } from '@/utils/format';
import { useToastStore } from '@/store';

const INVENTORY_GRADES = ['A+', 'A', 'B'];

export function InventoryPage() {
  const { data: productsData, isLoading } = useProducts({ active: 'true' });
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { notify } = useToastStore();
  const { user } = useAuthStore();
  const canEdit = user?.role === 'admin' || user?.role === 'yard';
  const [searchQuery, setSearchQuery] = useState('');
  const [varietyFilter, setVarietyFilter] = useState('All');
  const [kindFilter, setKindFilter] = useState('All');
  const [hideZeroStock, setHideZeroStock] = useState(true);
  const { isTablet, isMobile } = useViewport();
  const [qrLabel, setQrLabel] = useState<{ product: any; dataUrl: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function executeDelete() {
    if (!confirmDeleteId) return;
    deleteProduct.mutate(confirmDeleteId, {
      onSuccess: () => { setConfirmDeleteId(null); notify(`${confirmDeleteId} removed from inventory`, 'success'); },
      onError: (err: any) => { setConfirmDeleteId(null); notify(err.message || 'Delete failed', 'error'); },
    });
  }

  const handlePrintQR = async (product: any) => {
    const text = product.id;
    try {
      const dataUrl = await QRCode.toDataURL(text, {
        errorCorrectionLevel: 'M', margin: 1, width: 200,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrLabel({ product, dataUrl });
    } catch {
      notify('Failed to generate QR', 'error');
    }
  };

  const printQrLabel = () => {
    if (!qrLabel) return;
    const p = qrLabel.product;
    const details = getProductDetails(p);
    const w = window.open('', '_blank', 'width=400,height=520');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>QR Label – ${p.id}</title>
<style>
  body { margin: 0; display: flex; justify-content: center; align-items: flex-start; background: #fff; font-family: 'IBM Plex Mono', monospace; }
  .label { width: 240px; padding: 16px; border: 1.5px solid #222; border-radius: 6px; margin: 24px auto; text-align: center; }
  .label img { width: 160px; height: 160px; display: block; margin: 0 auto 10px; }
  .label .id { font-size: 13px; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px; }
  .label .variety { font-size: 11px; font-weight: 600; margin-bottom: 2px; }
  .label .details { font-size: 10px; color: #555; margin-bottom: 2px; }
  .label .co { font-size: 9px; color: #999; margin-top: 8px; }
  @media print { body { margin: 0; } }
</style></head><body>
<div class="label">
  <img src="${qrLabel.dataUrl}" alt="QR"/>
  <div class="id">${p.id}</div>
  <div class="variety">${p.variety}${p.grade ? ' · Gr.' + p.grade : ''}</div>
  <div class="details">${details}</div>
  <div class="co">MODERNEX STONES LLP</div>
</div>
<script>window.onload = () => { window.print(); window.close(); }<\/script>
</body></html>`);
    w.document.close();
  };

  const products = productsData?.products || [];

  // Get unique varieties and kinds for filters
  const varieties = useMemo(() => {
    const uniqueVarieties = new Set(products.map((p: any) => p.variety));
    return ['All', ...Array.from(uniqueVarieties).sort()];
  }, [products]);

  const kinds = useMemo(() => {
    const uniqueKinds = new Set(products.map((p: any) => p.kind));
    return ['All', ...Array.from(uniqueKinds).sort()];
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      const matchesSearch = !searchQuery ||
        p.variety?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesVariety = varietyFilter === 'All' || p.variety === varietyFilter;
      const matchesKind = kindFilter === 'All' || p.kind === kindFilter;
      const matchesStock = !hideZeroStock || (p.stock ?? 0) > 0;
      return matchesSearch && matchesVariety && matchesKind && matchesStock;
    });
  }, [products, searchQuery, varietyFilter, kindFilter, hideZeroStock]);

  const zeroStockCount = products.filter((p: any) => (p.stock ?? 0) === 0).length;
  const inStockCount   = products.length - zeroStockCount;

  // Calculate stats
  const totalStock = filteredProducts.reduce((sum: number, p: any) => sum + (p.stock || 0), 0);
  const totalValue = filteredProducts.reduce((sum: number, p: any) => sum + (p.rate_paise * (p.stock || 0)), 0);
  const lowStockCount = products.filter((p: any) => p.stock <= 2 && p.stock > 0).length;

  const getKindLabel = (kind: string) => {
    const labels: Record<string, string> = {
      block: 'Block',
      slab: 'Slab',
      tile: 'Tile',
      cts: 'CTS',
      strip: 'Strip',
      kerb: 'Kerb',
      cobble: 'Cobble',
      chips: 'Chips',
      dust: 'Dust',
      monument: 'Monument'
    };
    return labels[kind] || kind;
  };

  const getProductDetails = (p: any) => {
    switch (p.kind) {
      case 'block':
        return `${p.length_mm || 0}×${p.width_mm || 0}×${p.height_mm || 0}mm`;
      case 'slab':
        return `${p.size_lw || '—'} · ${p.thickness_mm || 0}mm${p.grade ? ` · Gr.${p.grade}` : ''}`;
      case 'tile':
        return `${p.size_lw || '—'} · ${p.thickness_mm || 0}mm`;
      case 'cts':
        return `${p.length_mm || 0}×${p.width_mm || 0}mm`;
      case 'strip':
        return `${p.length_mm || 0}×${p.width_mm || 0}mm`;
      case 'kerb':
        return `${p.profile || '—'} · ${p.length_mm || 0}mm`;
      case 'cobble':
        return `${p.cobble_type || '—'} · ${p.length_mm || 0}×${p.width_mm || 0}×${p.height_mm || 0}mm`;
      case 'chips':
        return `${p.mesh_size_mm || 0}mm mesh`;
      case 'monument':
        return `${p.monument_type || '—'} · ${p.thickness_mm || 0}mm`;
      default:
        return '—';
    }
  };

  const handleInventoryCellValueChanged = async (event: CellValueChangedEvent<any>) => {
    const columnKey = event.colDef.colId || event.colDef.field;
    if (!columnKey || !event.data?.id) return;

    const normalize = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());
    if (normalize(event.newValue) === normalize(event.oldValue)) return;

    let patch: Record<string, unknown>;

    try {
      switch (columnKey) {
        case 'variety': {
          const variety = normalize(event.newValue);
          if (!variety) throw new Error('Variety is required');
          patch = { variety };
          break;
        }
        case 'grade': {
          patch = { grade: event.newValue || null };
          break;
        }
        case 'lot_id': {
          patch = { lot_id: normalize(event.newValue) || null };
          break;
        }
        case 'stock': {
          const stock = Number(event.newValue);
          if (!Number.isFinite(stock) || stock < 0) throw new Error('Stock must be a non-negative number');
          patch = { stock };
          break;
        }
        case 'rate_rupees': {
          const rateRupees = Number(event.newValue);
          if (!Number.isFinite(rateRupees) || rateRupees < 0) throw new Error('Rate must be a non-negative number');
          patch = { rate_paise: Math.round(rateRupees * 100) };
          break;
        }
        case 'notes': {
          patch = { notes: normalize(event.newValue) || null };
          break;
        }
        default:
          return;
      }

      await updateProduct.mutateAsync({ id: event.data.id, data: patch as any });
      event.api.refreshCells({ rowNodes: [event.node], force: true });
      notify('Inventory record updated', 'success');
    } catch (err: any) {
      if (columnKey === 'rate_rupees') {
        event.data.rate_paise = Math.round(Number(event.oldValue || 0) * 100);
      } else {
        event.data[columnKey] = event.oldValue;
      }
      event.api.refreshCells({ rowNodes: [event.node], force: true });
      notify(err.message || 'Failed to update inventory record', 'error');
    }
  };

  const columnDefs = useMemo<ColDef<any>[]>(() => [
    { headerName: 'ID', field: 'id', minWidth: isMobile ? 110 : 140, pinned: isMobile ? undefined : 'left' },
    { headerName: 'Variety', field: 'variety', minWidth: isMobile ? 150 : 180, editable: canEdit },
    {
      headerName: 'Kind',
      field: 'kind',
      minWidth: isMobile ? 100 : 130,
      valueFormatter: (params) => getKindLabel(params.value),
    },
    {
      headerName: 'Details',
      field: 'details',
      minWidth: 220,
      hide: isMobile,
      valueGetter: (params) => getProductDetails(params.data),
    },
    {
      headerName: 'Grade',
      field: 'grade',
      minWidth: 110,
      hide: isMobile,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['', ...INVENTORY_GRADES] },
      valueFormatter: (params) => params.value || '—',
    },
    {
      headerName: 'Lot',
      field: 'lot_id',
      minWidth: 130,
      hide: isTablet,
      editable: true,
      valueFormatter: (params) => params.value || '—',
    },
    {
      headerName: 'Location',
      field: 'current_location_name',
      minWidth: 150,
      hide: isMobile,
      valueGetter: (params) => params.data?.current_location_name || params.data?.current_location_id || '—',
    },
    {
      headerName: 'Stock',
      field: 'stock',
      minWidth: isMobile ? 110 : 130,
      type: 'numericColumn',
      editable: true,
      valueParser: (params) => Number(params.newValue),
      valueFormatter: (params) => `${params.value || 0} ${params.data?.uom || 'pc'}`,
    },
    {
      headerName: 'Rate (Rs)',
      field: 'rate_rupees',
      minWidth: 140,
      hide: isMobile,
      type: 'numericColumn',
      editable: true,
      valueGetter: (params) => Number(params.data?.rate_paise || 0) / 100,
      valueParser: (params) => Number(params.newValue),
      valueFormatter: (params) => formatINR(Math.round(Number(params.value || 0) * 100)),
    },
    {
      headerName: 'Value',
      field: 'inventory_value',
      minWidth: isMobile ? 120 : 150,
      type: 'numericColumn',
      valueGetter: (params) => (params.data?.rate_paise || 0) * (params.data?.stock || 0),
      valueFormatter: (params) => formatINR(params.value || 0),
    },
    {
      headerName: 'Notes',
      field: 'notes',
      minWidth: 220,
      hide: isTablet,
      editable: true,
      valueFormatter: (params) => params.value || '—',
    },
    {
      headerName: 'Trace',
      field: 'trace',
      minWidth: 90,
      maxWidth: 90,
      sortable: false,
      filter: false,
      floatingFilter: false,
      cellRenderer: (params: any) => (
        <Link to={`/trace/product/${encodeURIComponent(params.data?.id || '')}`} style={{ fontSize: 11, color: 'var(--t2)', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace" }}>
          Trace ↗
        </Link>
      ),
    },
    {
      headerName: 'QR',
      field: 'qr',
      minWidth: 70,
      maxWidth: 70,
      sortable: false,
      filter: false,
      floatingFilter: false,
      cellRenderer: (params: any) => (
        <button
          onClick={() => handlePrintQR(params.data)}
          style={{ fontSize: 11, color: 'var(--t2)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontFamily: "'IBM Plex Mono', monospace" }}
          title="Print QR label for this product"
        >
          QR 🖨
        </button>
      ),
    },
    ...(canEdit ? [{
      headerName: 'Delete',
      field: 'delete_action',
      minWidth: 80,
      maxWidth: 80,
      sortable: false,
      filter: false,
      floatingFilter: false,
      cellRenderer: (params: any) => (
        <button
          onClick={() => setConfirmDeleteId(params.data?.id)}
          title="Delete this product"
          style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 3, cursor: 'pointer', padding: '1px 7px', opacity: 0.75 }}
        >✕ Del</button>
      ),
    }] : []),
  ], [isMobile, isTablet, canEdit]);

  return (
    <div className="page">
      {/* QR Label Preview Modal */}
      {qrLabel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setQrLabel(null)}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, minWidth: 260, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}>
            <img src={qrLabel.dataUrl} alt="QR" style={{ width: 160, height: 160, display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{qrLabel.product.id}</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{qrLabel.product.variety}{qrLabel.product.grade ? ` · Gr.${qrLabel.product.grade}` : ''}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 16 }}>{getProductDetails(qrLabel.product)}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn-primary" onClick={printQrLabel}>🖨 Print Label</button>
              <button className="btn-secondary" onClick={() => setQrLabel(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ marginBottom: '8px' }}>Inventory</h1>
        <p style={{ color: 'var(--t3)', fontSize: '13px', marginBottom: '0' }}>
          All products · Multi-kind catalog · FIFO
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <StatCard label="In Stock" value={inStockCount.toString()} subtitle={`${zeroStockCount > 0 ? `+ ${zeroStockCount} zero-stock` : 'all active'}`} />
        <StatCard label="Total Stock" value={totalStock.toString()} subtitle="units (in-stock products)" />
        <StatCard label="Stock Value" value={formatINR(totalValue)} subtitle="at selling rate" />
        <StatCard label="Low Stock" value={lowStockCount.toString()} subtitle="≤ 2 pieces" color="var(--rust)" />
        {zeroStockCount > 0 && (
          <StatCard label="Zero Stock" value={zeroStockCount.toString()} subtitle="consumed / written off" color="var(--t3)" />
        )}
      </div>

      {/* Delete confirmation banner */}
      {confirmDeleteId && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: 'rgba(220,50,50,0.1)', border: '1px solid var(--red)',
          borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13,
        }}>
          <span style={{ color: 'var(--red)', fontWeight: 600 }}>
            Remove <span style={{ fontFamily: 'monospace' }}>{confirmDeleteId}</span> from inventory?
            This cannot be undone.
          </span>
          <button onClick={executeDelete} disabled={deleteProduct.isPending}
            style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {deleteProduct.isPending ? 'Removing…' : 'Yes, delete'}
          </button>
          <button onClick={() => setConfirmDeleteId(null)}
            style={{ background: 'var(--bg2)', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: 4, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <input
          type="search"
          placeholder="Search variety or product ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: '1 1 250px',
            padding: '8px 12px',
            border: '1px solid var(--bd)',
            borderRadius: '4px',
            fontSize: '13px',
            color: 'var(--t1)',
            backgroundColor: 'var(--bg2)'
          }}
        />
        <select
          value={varietyFilter}
          onChange={(e) => setVarietyFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--bd)',
            borderRadius: '4px',
            fontSize: '13px',
            minWidth: '150px',
            color: 'var(--t1)',
            backgroundColor: 'var(--bg2)'
          }}
        >
          {varieties.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--bd)',
            borderRadius: '4px',
            fontSize: '13px',
            minWidth: '150px',
            color: 'var(--t1)',
            backgroundColor: 'var(--bg2)'
          }}
        >
          {kinds.map(k => <option key={k} value={k}>{k === 'All' ? 'All Kinds' : getKindLabel(k)}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t2)', cursor: 'pointer', userSelect: 'none', padding: '0 4px' }}>
          <input type="checkbox" checked={hideZeroStock} onChange={e => setHideZeroStock(e.target.checked)} style={{ accentColor: 'var(--rust)', width: 14, height: 14 }} />
          Hide zero-stock
          {zeroStockCount > 0 && <span style={{ fontSize: 11, background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: '0 7px', color: 'var(--t3)' }}>{zeroStockCount}</span>}
        </label>
      </div>

      {/* Products Table */}
      {isLoading ? (
        <p>Loading inventory...</p>
      ) : filteredProducts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>
          <p>{hideZeroStock && zeroStockCount > 0
            ? `All ${zeroStockCount} product${zeroStockCount > 1 ? 's' : ''} have zero stock. Uncheck "Hide zero-stock" to see them.`
            : 'No products found matching your filters.'}</p>
        </div>
      ) : (
        <DataGridTable
          rowData={filteredProducts}
          columnDefs={columnDefs}
          quickFilterText={searchQuery}
          onCellValueChanged={handleInventoryCellValueChanged}
          getRowId={(params) => params.data.id}
          singleClickEdit
          height={isMobile ? 'min(360px, calc(100dvh - 290px))' : 'clamp(360px, calc(100dvh - 320px), 560px)'}
          pageSize={25}
          emptyMessage="No products found matching your filters."
        />
      )}
    </div>
  );
}

function StatCard({ label, value, subtitle, color }: { label: string; value: string; subtitle: string; color?: string }) {
  return (
    <div style={{
      backgroundColor: 'var(--bg2)',
      border: '1px solid var(--bd)',
      borderRadius: '6px',
      padding: '12px 14px'
    }}>
      <div style={{ fontSize: '10px', color: 'var(--t3)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: color || 'var(--t1)', marginBottom: '2px' }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>
        {subtitle}
      </div>
    </div>
  );
}
