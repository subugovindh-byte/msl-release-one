import { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import {
  useInvoices, usePayments, useDebitCreditNotes, useCreateDCN, useConfirmDCN, useCancelDCN,
  useCustomerLedger, useVendorLedger, useCustomers, useVendors, useReversePayment,
} from '@/hooks/useApi';
import { DataGridTable } from '@/components/DataGridTable';
import { formatINR } from '@/utils/format';
import { useToastStore, useAuthStore } from '@/store';

type Tab = 'receivable' | 'payments' | 'dcn' | 'ledger';

const BLANK_DCN = { type: 'credit', customer_id: '', ref_invoice_id: '', amount_paise: 0, reason: '', date: new Date().toISOString().slice(0, 10) };

export function AccountsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('receivable');
  const [showCreateDCN, setShowCreateDCN] = useState(false);
  const [dcnForm, setDcnForm] = useState({ ...BLANK_DCN });
  const [ledgerType, setLedgerType] = useState<'customer' | 'vendor'>('customer');
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const { notify } = useToastStore();

  const { data: invoicesData } = useInvoices({});
  const { data: paymentsData } = usePayments({});
  const { data: dcnData } = useDebitCreditNotes({});
  const { data: customersData } = useCustomers({});
  const { data: vendorsData } = useVendors({});
  const { data: customerLedgerData } = useCustomerLedger(ledgerType === 'customer' ? selectedPartyId : '');
  const { data: vendorLedgerData } = useVendorLedger(ledgerType === 'vendor' ? selectedPartyId : '');

  const createDCN = useCreateDCN();
  const confirmDCN = useConfirmDCN();
  const cancelDCN = useCancelDCN();
  const reversePayment = useReversePayment();
  const { user } = useAuthStore();
  const canManage = user?.role === 'admin' || user?.role === 'accounts';

  const handleReversePayment = (p: any) => {
    const link = p.invoice_id ? `invoice ${p.invoice_id}` : p.po_id ? `PO ${p.po_id}` : p.cp_id ? `purchase ${p.cp_id}` : 'general';
    if (!window.confirm(`Reverse payment ${p.id} (${formatINR(p.amount_paise)}, ${link})?\n\nThis removes the entry and restores the balance.`)) return;
    reversePayment.mutate(p.id, {
      onSuccess: () => notify(`Payment ${p.id} reversed`, 'success'),
      onError: (e: any) => notify(e.message || 'Failed to reverse', 'error'),
    });
  };

  const invoices: any[] = invoicesData?.invoices || [];
  const payments: any[] = paymentsData?.payments || [];
  const dcnList: any[] = dcnData?.notes || [];
  const customers: any[] = customersData?.customers || [];
  const vendors: any[] = (vendorsData as any)?.vendors || [];
  const ledgerEntries: any[] = (ledgerType === 'customer' ? customerLedgerData?.entries : vendorLedgerData?.entries) || [];

  const unpaidInvoices = invoices.filter((inv) => !inv.paid);
  const paidInvoices = invoices.filter((inv) => inv.paid);

  const totalReceivable = unpaidInvoices.reduce((sum, inv) => sum + inv.total_paise, 0);
  const totalCollected = paidInvoices.reduce((sum, inv) => sum + inv.total_paise, 0);
  const totalPayments = payments.reduce((sum, p) => sum + p.amount_paise, 0);

  const handleCreateDCN = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createDCN.mutateAsync({ ...dcnForm, amount_paise: Math.round(parseFloat(String(dcnForm.amount_paise)) * 100) || 0 });
      notify('Note created', 'success');
      setShowCreateDCN(false);
      setDcnForm({ ...BLANK_DCN });
    } catch (err: any) { notify(err.message || 'Failed to create note', 'error'); }
  };

  const handleConfirmDCN = async (id: string) => {
    try {
      await confirmDCN.mutateAsync(id as any);
      notify('Note confirmed', 'success');
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleCancelDCN = async (id: string) => {
    if (!window.confirm('Cancel this note?')) return;
    try {
      await cancelDCN.mutateAsync(id as any);
      notify('Note cancelled', 'success');
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const receivableColDefs = useMemo<ColDef[]>(() => [
    { headerName: 'Invoice', field: 'id', minWidth: 140, pinned: 'left' },
    {
      headerName: 'Date',
      field: 'date',
      minWidth: 120,
      valueFormatter: (p) => p.value ? new Date(p.value).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—',
    },
    { headerName: 'Customer', field: 'customer_name', minWidth: 180, flex: 2 },
    {
      headerName: 'Amount',
      field: 'total_paise',
      minWidth: 140,
      type: 'numericColumn',
      valueFormatter: (p) => formatINR(p.value),
    },
    {
      headerName: 'Days Overdue',
      colId: 'days_overdue',
      minWidth: 150,
      type: 'numericColumn',
      valueGetter: (p) =>
        p.data?.date ? Math.floor((Date.now() - new Date(p.data.date).getTime()) / 86400000) : 0,
      cellRenderer: (p: any) => {
        const d = p.value as number;
        return (
          <span style={{ padding: '2px 8px', backgroundColor: 'var(--bg3)', color: 'var(--t2)', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
            {d} days
          </span>
        );
      },
    },
    {
      headerName: '',
      colId: 'view',
      minWidth: 70,
      maxWidth: 70,
      sortable: false,
      filter: false,
      floatingFilter: false,
      cellRenderer: (p: any) => (
        <a
          href={`/invoice/${(p.data?.id || '').replace(/\//g, '~')}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: 'var(--t2)', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace" }}
        >
          Receipt ↗
        </a>
      ),
    },
  ], []);

  const paymentsColDefs = useMemo<ColDef[]>(() => [
    {
      headerName: 'ID',
      field: 'id',
      minWidth: 130,
      pinned: 'left',
      cellRenderer: (p: any) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--t1)', fontWeight: 700 }}>{p.value}</span>
      ),
    },
    {
      headerName: 'Date',
      field: 'date',
      minWidth: 120,
      valueFormatter: (p) => p.value ? new Date(p.value).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—',
    },
    {
      headerName: 'Type',
      field: 'type',
      minWidth: 100,
      cellRenderer: (p: any) => {
        const isReceipt = p.value === 'receipt';
        return (
          <span style={{
            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
            background: isReceipt ? 'var(--sageW)' : 'var(--blueW)',
            color: isReceipt ? 'var(--sage)' : 'var(--blue)',
            textTransform: 'capitalize',
          }}>{p.value || '—'}</span>
        );
      },
    },
    {
      headerName: 'Party',
      field: 'party',
      minWidth: 170,
      flex: 2,
      valueFormatter: (p) => p.value || '—',
    },
    {
      headerName: 'Invoice / PO / CP',
      colId: 'ref_doc',
      minWidth: 160,
      valueGetter: (p) => p.data?.invoice_id || p.data?.po_id || p.data?.cp_id || '—',
      cellRenderer: (p: any) => {
        const inv = p.data?.invoice_id;
        const po = p.data?.po_id;
        const cp = p.data?.cp_id;
        if (inv) return (
          <a href={`/invoice/${inv.replace(/\//g, '~')}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: 'var(--t2)', textDecoration: 'none', fontFamily: 'monospace' }}>
            {inv} ↗
          </a>
        );
        if (po) return (
          <a href={`/purchase/${po.replace(/\//g, '~')}`} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: 'var(--t2)', textDecoration: 'none', fontFamily: 'monospace' }}>
            {po} ↗
          </a>
        );
        if (cp) return (
          <span style={{ fontSize: 12, color: 'var(--t2)', fontFamily: 'monospace' }}>{cp}</span>
        );
        return <span style={{ color: 'var(--t3)' }}>—</span>;
      },
    },
    {
      headerName: 'Mode',
      field: 'mode',
      minWidth: 110,
      cellRenderer: (p: any) => (
        <span style={{ padding: '2px 8px', backgroundColor: 'var(--bg3)', color: 'var(--t2)', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
          {p.value || '—'}
        </span>
      ),
    },
    {
      headerName: 'UTR / Ref',
      field: 'utr',
      minWidth: 150,
      valueFormatter: (p) => p.value || '—',
    },
    {
      headerName: 'Amount',
      field: 'amount_paise',
      minWidth: 140,
      type: 'numericColumn',
      valueFormatter: (p) => formatINR(p.value),
    },
    {
      headerName: 'Notes',
      field: 'notes',
      minWidth: 160,
      flex: 1,
      valueFormatter: (p) => p.value || '—',
    },
    ...(canManage ? [{
      headerName: '',
      colId: 'reverse',
      minWidth: 100,
      maxWidth: 100,
      sortable: false,
      filter: false,
      floatingFilter: false,
      cellRenderer: (p: any) => (
        <button
          onClick={() => handleReversePayment(p.data)}
          disabled={reversePayment.isPending}
          title="Reverse this payment and restore the balance"
          style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer', padding: '2px 9px', fontWeight: 600 }}
        >↩ Reverse</button>
      ),
    }] as ColDef[] : []),
  ], [canManage, reversePayment.isPending]);

  const TAB_LABELS: Record<Tab, string> = {
    receivable: `Receivables (${unpaidInvoices.length})`,
    payments: `Payments (${payments.length})`,
    dcn: `Debit/Credit Notes (${dcnList.length})`,
    ledger: 'Ledger',
  };

  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ marginBottom: '8px' }}>Accounts</h1>
        <p style={{ color: 'var(--t3)', fontSize: '13px', marginBottom: '0' }}>
          Track receivables, payables, payment collections, and credit/debit notes
        </p>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        <SummaryCard label="Accounts Receivable" value={formatINR(totalReceivable)} sub={`${unpaidInvoices.length} unpaid invoices`} />
        <SummaryCard label="Collected" value={formatINR(totalCollected)} sub={`${paidInvoices.length} paid invoices`} />
        <SummaryCard label="Total Payments" value={formatINR(totalPayments)} sub={`${payments.length} payment records`} />
        <SummaryCard label="Credit/Debit Notes" value={String(dcnList.length)} sub={`${dcnList.filter((n) => n.status === 'confirmed').length} confirmed`} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid var(--bd)' }}>
        {(['receivable', 'payments', 'dcn', 'ledger'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === tab ? '3px solid var(--rust)' : '3px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === tab ? 'var(--t1)' : 'var(--t3)',
              fontWeight: activeTab === tab ? 700 : 500,
              cursor: 'pointer',
              fontSize: '14px',
              marginBottom: '-2px',
              transition: 'all 0.2s',
            }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'receivable' && (
        <DataGridTable
          rowData={unpaidInvoices}
          columnDefs={receivableColDefs}
          getRowId={(p) => p.data.id}
          emptyMessage="All invoices are paid. No outstanding receivables."
          height={480}
        />
      )}

      {activeTab === 'payments' && (
        <DataGridTable
          rowData={payments}
          columnDefs={paymentsColDefs}
          getRowId={(p) => p.data.id}
          emptyMessage="No payment records found."
          height={480}
        />
      )}

      {/* Debit / Credit Notes Tab */}
      {activeTab === 'dcn' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button
              onClick={() => setShowCreateDCN(!showCreateDCN)}
              style={{ padding: '10px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}
            >
              {showCreateDCN ? 'Cancel' : '+ New Note'}
            </button>
          </div>

          {showCreateDCN && (
            <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Create Debit / Credit Note</h3>
              <form onSubmit={handleCreateDCN}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div>
                    <label className="fl">Type *</label>
                    <select value={dcnForm.type} onChange={(e) => setDcnForm({ ...dcnForm, type: e.target.value })} required className="fsel">
                      <option value="credit">Credit Note (CN) — reduces customer payable</option>
                      <option value="debit">Debit Note (DN) — increases customer payable</option>
                    </select>
                  </div>
                  <div>
                    <label className="fl">Customer *</label>
                    <select value={dcnForm.customer_id} onChange={(e) => setDcnForm({ ...dcnForm, customer_id: e.target.value })} required className="fsel">
                      <option value="">— Select customer —</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div><label className="fl">Ref Invoice ID</label><input type="text" value={dcnForm.ref_invoice_id} onChange={(e) => setDcnForm({ ...dcnForm, ref_invoice_id: e.target.value })} className="fi" placeholder="INV-001 (optional)" /></div>
                  <div><label className="fl">Date *</label><input type="date" value={dcnForm.date} onChange={(e) => setDcnForm({ ...dcnForm, date: e.target.value })} required className="fi" /></div>
                  <div>
                    <label className="fl">Amount (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={dcnForm.amount_paise || ''}
                      onChange={(e) => setDcnForm({ ...dcnForm, amount_paise: parseFloat(e.target.value) || 0 })}
                      required
                      className="fi"
                      placeholder="Enter amount in rupees"
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}><label className="fl">Reason *</label><input type="text" value={dcnForm.reason} onChange={(e) => setDcnForm({ ...dcnForm, reason: e.target.value })} required className="fi" placeholder="Reason for credit/debit note" /></div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="submit" disabled={createDCN.isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: '4px', cursor: createDCN.isPending ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                    {createDCN.isPending ? 'Creating...' : 'Create Note'}
                  </button>
                  <button type="button" onClick={() => setShowCreateDCN(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {dcnList.length === 0 ? (
            <p style={{ color: 'var(--t3)' }}>No debit/credit notes found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {dcnList.map((note) => (
                <div key={note.id} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '8px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                    backgroundColor: note.type === 'credit' ? 'var(--sageW)' : 'var(--amberW)',
                    color: note.type === 'credit' ? 'var(--sage)' : 'var(--amber)',
                  }}>{note.type === 'credit' ? 'CR' : 'DR'}</span>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--t1)', minWidth: '120px' }}>{note.id}</span>
                  <span style={{ fontSize: '13px', color: 'var(--t2)', flex: 1 }}>{note.customer_name || note.customer_id}</span>
                  {note.ref_invoice_id && <span style={{ fontSize: '12px', color: 'var(--t3)' }}>Ref: {note.ref_invoice_id}</span>}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)' }}>{formatINR(note.amount_paise)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--t3)' }}>{note.date ? new Date(note.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''}</span>
                  <span style={{
                    padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                    backgroundColor: note.status === 'confirmed' ? 'var(--blueW)' : note.status === 'cancelled' ? 'var(--bg3)' : 'var(--amberW)',
                    color: note.status === 'confirmed' ? 'var(--blue)' : note.status === 'cancelled' ? 'var(--t3)' : 'var(--amber)',
                    textTransform: 'capitalize',
                  }}>{note.status}</span>
                  {note.status === 'draft' && (
                    <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                      <button onClick={() => handleConfirmDCN(note.id)} style={{ padding: '4px 12px', fontSize: '12px', fontWeight: 600, border: 'none', borderRadius: '4px', backgroundColor: 'var(--rust)', color: 'white', cursor: 'pointer' }}>Confirm</button>
                      <button onClick={() => handleCancelDCN(note.id)} style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid var(--bd)', borderRadius: '4px', backgroundColor: 'transparent', color: 'var(--t3)', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ledger Tab */}
      {activeTab === 'ledger' && (
        <div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--bd)' }}>
              <button
                onClick={() => { setLedgerType('customer'); setSelectedPartyId(''); }}
                style={{ padding: '8px 18px', border: 'none', backgroundColor: ledgerType === 'customer' ? 'var(--rust)' : 'var(--bg2)', color: ledgerType === 'customer' ? 'white' : 'var(--t2)', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
              >Customer</button>
              <button
                onClick={() => { setLedgerType('vendor'); setSelectedPartyId(''); }}
                style={{ padding: '8px 18px', border: 'none', backgroundColor: ledgerType === 'vendor' ? 'var(--rust)' : 'var(--bg2)', color: ledgerType === 'vendor' ? 'white' : 'var(--t2)', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
              >Vendor</button>
            </div>
            <select
              value={selectedPartyId}
              onChange={(e) => setSelectedPartyId(e.target.value)}
              className="fsel"
              style={{ minWidth: '260px' }}
            >
              <option value="">— Select {ledgerType} —</option>
              {(ledgerType === 'customer' ? customers : vendors).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {!selectedPartyId ? (
            <p style={{ color: 'var(--t3)' }}>Select a {ledgerType} to view their ledger.</p>
          ) : ledgerEntries.length === 0 ? (
            <p style={{ color: 'var(--t3)' }}>No ledger entries found.</p>
          ) : (
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg3)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t2)', fontSize: '11px', textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t2)', fontSize: '11px', textTransform: 'uppercase' }}>Type</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t2)', fontSize: '11px', textTransform: 'uppercase' }}>Reference</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t2)', fontSize: '11px', textTransform: 'uppercase', textAlign: 'right' }}>Debit</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t2)', fontSize: '11px', textTransform: 'uppercase', textAlign: 'right' }}>Credit</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--t2)', fontSize: '11px', textTransform: 'uppercase', textAlign: 'right' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerEntries.map((entry: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--t2)' }}>{entry.date ? new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, backgroundColor: 'var(--bg3)', color: 'var(--t2)', textTransform: 'capitalize' }}>{entry.type}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--t1)' }}>{entry.reference || '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: entry.debit_paise > 0 ? 'var(--rust)' : 'var(--t3)' }}>
                        {entry.debit_paise > 0 ? formatINR(entry.debit_paise) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: entry.credit_paise > 0 ? 'var(--sage)' : 'var(--t3)' }}>
                        {entry.credit_paise > 0 ? formatINR(entry.credit_paise) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: entry.balance_paise >= 0 ? 'var(--rust)' : 'var(--sage)' }}>
                        {formatINR(Math.abs(entry.balance_paise))} {entry.balance_paise >= 0 ? 'Dr' : 'Cr'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '8px', padding: '16px' }}>
      <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--t1)', marginBottom: '4px' }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--t3)' }}>{sub}</div>
    </div>
  );
}
