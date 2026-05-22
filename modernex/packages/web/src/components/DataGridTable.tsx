import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  type CellValueChangedEvent,
  type ColDef,
  type GetRowIdParams,
  type GridOptions,
} from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

interface DataGridTableProps<T> {
  rowData: T[];
  columnDefs: ColDef<T>[];
  quickFilterText?: string;
  height?: number | string;
  pageSize?: number;
  emptyMessage?: string;
  onCellValueChanged?: (event: CellValueChangedEvent<T>) => void | Promise<void>;
  getRowId?: (params: GetRowIdParams<T>) => string;
  singleClickEdit?: boolean;
}

export function DataGridTable<T>({
  rowData,
  columnDefs,
  quickFilterText,
  height = 520,
  pageSize = 15,
  emptyMessage = 'No rows to display.',
  onCellValueChanged,
  getRowId,
  singleClickEdit = false,
}: DataGridTableProps<T>) {
  const defaultColDef = useMemo<ColDef<T>>(() => ({
    sortable: true,
    filter: true,
    floatingFilter: true,
    resizable: true,
    minWidth: 120,
    flex: 1,
  }), []);

  const gridOptions = useMemo<GridOptions<T>>(() => ({
    pagination: true,
    paginationPageSize: pageSize,
    paginationPageSizeSelector: [10, 15, 25, 50],
    animateRows: true,
    rowSelection: { mode: 'singleRow' },
    suppressCellFocus: !onCellValueChanged,
    suppressMovableColumns: true,
    rowHeight: 44,
    headerHeight: 42,
    floatingFiltersHeight: 38,
    stopEditingWhenCellsLoseFocus: true,
    overlayNoRowsTemplate: `<span class="ag-empty-state">${emptyMessage}</span>`,
  }), [emptyMessage, onCellValueChanged, pageSize]);

  return (
    <div className="grid-shell">
      <div className="ag-theme-quartz modernex-grid" style={{ height, width: '100%' }}>
        <AgGridReact<T>
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilterText}
          gridOptions={gridOptions}
          onCellValueChanged={onCellValueChanged}
          getRowId={getRowId}
          singleClickEdit={singleClickEdit}
          theme="legacy"
        />
      </div>
    </div>
  );
}