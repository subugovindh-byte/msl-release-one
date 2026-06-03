import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CGST_RATE_LABEL, SGST_RATE_LABEL, GST_RATE_LABEL, PAYMENT_MODES } from '@modernex/shared'; // CGST/SGST used in totals
import { usePurchaseOrder, useCompany, useCreatePayment, useGRNList, useCreateGRN, useUpdatePOTransport, useVendors, useUpdatePOStatus, usePOMatch, useRecordPOMatch } from '@/hooks/useApi';
import { formatINR, formatDate, selectOnFocus } from '@/utils/format';
import { useToastStore } from '@/store';

function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = Math.round(paise % 100);
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function w(n: number): string {
    if (n === 0) return '';
    if (n < 20) return a[n] ?? '';
    if (n < 100) return (b[Math.floor(n / 10)] ?? '') + (n % 10 ? ' ' + (a[n % 10] ?? '') : '');
    if (n < 1000) return (a[Math.floor(n / 100)] ?? '') + ' Hundred' + (n % 100 ? ' ' + w(n % 100) : '');
    if (n < 100000) return w(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + w(n % 1000) : '');
    if (n < 10000000) return w(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + w(n % 100000) : '');
    return w(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + w(n % 10000000) : '');
  }
  const rStr = w(rupees) || 'Zero';
  const pStr = p > 0 ? ` and ${w(p)} Paise` : '';
  return rStr + ' Rupees' + pStr + ' Only';
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  new:       { label: 'New',       color: 'var(--blue)' },
  approved:  { label: 'Approved',  color: 'var(--sage)' },
  received:  { label: 'Received',  color: 'var(--amber)' },
  closed:    { label: 'Closed',    color: 'var(--t2)' },
  cancelled: { label: 'Cancelled', color: 'var(--red)' },
};

const PAY_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  unpaid:  { label: 'Unpaid',  bg: '#fee2e2', color: '#b91c1c' },
  partial: { label: 'Partial', bg: '#fef9c3', color: '#92400e' },
  paid:    { label: 'Paid',    bg: '#dcfce7', color: '#15803d' },
};

const BLANK_FORM = { amount_paise: 0, mode: 'NEFT', utr: '', date: '', notes: '' };
const BLANK_GRN = { blocks_received: 0, cft_received: 0, net_weight_kg: 0, scale_ticket_no: '', condition_note: '', qc_pass: true, qc_notes: '', vehicle_no: '', lr_no: '' };
const BLANK_TRANSPORT = { transport_vendor_id: '', transport_bill_no: '', transport_bill_date: '', transport_paise: 0, vehicle_no: '', lr_no: '', delivered_at_site: false, delivered_date: '' };

export function PurchaseOrderReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const decodedId = id ? id.replace(/~/g, '/') : '';

  const { data: poData, isLoading, error } = usePurchaseOrder(decodedId);
  const { data: companyData } = useCompany();
  const { data: vendorsData } = useVendors({ type: 'Transporter' });
  const { data: grnData, refetch: refetchGRN } = useGRNList({ po_id: decodedId });
  const { notify } = useToastStore();

  const createPayment = useCreatePayment({
    onSuccess: () => { notify('Payment recorded', 'success'); setShowPayForm(false); setPayForm(BLANK_FORM); },
    onError: () => notify('Failed to record payment', 'error'),
  });
  const createGRN = useCreateGRN();
  const updateTransport = useUpdatePOTransport(decodedId);
  const updateStatus = useUpdatePOStatus();
  const { data: matchData } = usePOMatch(decodedId);
  const recordMatch = useRecordPOMatch();

  const [showMatchForm, setShowMatchForm] = useState(false);
  const [matchInvNo, setMatchInvNo] = useState('');
  const [matchInvAmount, setMatchInvAmount] = useState('');
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ ...BLANK_FORM });
  const [payAmountMode, setPayAmountMode] = useState<'full' | 'custom'>('full');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  useEffect(() => {
    if (!decodedId) return;
    QRCode.toDataURL(decodedId, { width: 80, margin: 1, color: { dark: '#1a1612', light: '#ffffff' } })
      .then(setQrDataUrl).catch(() => {});
  }, [decodedId]);

  async function printBlockStickers() {
    if (!poData?.po) return;
    const p = poData.po as any;
    const url = window.location.href;
    // Generate a large, high-res QR for the sticker
    const stickerQR = await QRCode.toDataURL(url, {
      width: 300, margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
    const blockCount = p.blocks ?? 1;
    const dateStr = p.date ? new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    // Build one sticker div per block
    const stickers = Array.from({ length: blockCount }, (_, i) => `
      <div class="sticker">
        <div class="sticker-top">
          <div class="company">MODERNEX STONES</div>
          <div class="tag">GRANITE BLOCK</div>
        </div>
        <img class="qr" src="${stickerQR}" alt="QR" />
        <div class="po-id">${p.id}</div>
        <div class="meta">${p.vendor_name ?? p.vendor_id ?? ''}</div>
        <div class="meta">${p.variety ?? ''} &nbsp;·&nbsp; Block ${i + 1} of ${blockCount}</div>
        <div class="meta date">${dateStr}</div>
        <div class="scan-hint">Scan to open PO &amp; mark inspection</div>
      </div>
    `).join('');
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Block QR Stickers — ${p.id}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; font-family: 'Helvetica Neue', Arial, sans-serif; }
  .page { display: flex; flex-wrap: wrap; gap: 8mm; padding: 8mm; }
  .sticker {
    width: 75mm; border: 1.5px solid #222; border-radius: 4mm;
    padding: 4mm; display: flex; flex-direction: column;
    align-items: center; gap: 2mm; background: #fff;
    page-break-inside: avoid;
  }
  .sticker-top { width: 100%; display: flex; justify-content: space-between; align-items: baseline; }
  .company { font-size: 7pt; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #1a1612; }
  .tag { font-size: 6pt; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
         background: #1a1612; color: #fff; padding: 1.5mm 3mm; border-radius: 2mm; }
  .qr { width: 52mm; height: 52mm; display: block; border: 1px solid #e5e5e5; border-radius: 2mm; }
  .po-id { font-family: 'Courier New', monospace; font-size: 13pt; font-weight: 900;
           letter-spacing: -0.5px; color: #1a1612; text-align: center; }
  .meta { font-size: 7pt; color: #555; text-align: center; }
  .date { color: #888; font-size: 6.5pt; }
  .scan-hint { font-size: 6pt; color: #aaa; letter-spacing: 0.8px; text-transform: uppercase;
               border-top: 1px dashed #ddd; width: 100%; text-align: center; padding-top: 2mm; margin-top: 1mm; }
  @media print {
    @page { size: A4 portrait; margin: 8mm; }
    body { background: white; }
    .sticker { border-color: #000; }
  }
</style>
</head>
<body>
<div class="page">${stickers}</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;
    const win = window.open('', '_blank', 'width=800,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  }

  async function printRibbon() {
    if (!poData?.po) return;
    const p = poData.po as any;
    const url = window.location.href;
    const ribbonQR = await QRCode.toDataURL(url, {
      width: 200, margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
    const fp = (v: number) => '\u20b9' + (v / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const fd = (iso: string | null | undefined) => iso
      ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '\u2014';
    const row = (lbl: string, val: string, bold = false) =>
      `<tr${bold ? ' class="b"' : ''}><td class="l">${lbl}</td><td class="v">${val}</td></tr>`;
    const tax  = p.taxable_paise ?? 0;
    const gstV = p.gst_paise ?? 0;
    const tot  = p.total_paise ?? 0;
    const cg   = Math.round(gstV / 2);
    const sg   = gstV - cg;
    const tr   = p.transport_paise ?? 0;
    const mat  = tax - tr;
    const paid = p.paid_paise ?? 0;
    const bal  = p.balance_paise ?? (tot - paid);
    const payLbl = p.payment_status ?? (paid === 0 ? 'unpaid' : paid >= tot ? 'paid' : 'partial');
    const statusHistory = [
      ['Created',   p.created_at],
      ['Received',  p.received_at],
      ['Approved',  p.approved_at],
      ['Cancelled', p.cancelled_at],
    ].filter(([, ts]) => ts)
     .map(([lbl, ts]) => row(lbl as string, fd(ts as string)))
     .join('');
    const coName  = co?.name  ?? 'MODERNEX STONES LLP';
    const coCity  = co?.city  ?? 'Krishnagiri';
    const coState = co?.state ?? 'Tamil Nadu';
    const coGstin = co?.gstin ?? '33ACGFM7745J1ZW';
    const hsnCode = co?.hsn   ?? '2516';
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${p.id} \u2014 80mm</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#fff;font-family:'Courier New',Courier,monospace;font-size:9pt;color:#000;width:76mm;padding:4mm 3mm}
  .co{font-size:11pt;font-weight:900;letter-spacing:1px;text-transform:uppercase;text-align:center;margin-bottom:1mm}
  .sub{font-size:7pt;color:#555;text-align:center;line-height:1.6;margin-bottom:2mm}
  .rule{border:none;border-top:1px dashed #000;margin:2.5mm 0}
  .solid{border:none;border-top:2px solid #000;margin:2.5mm 0}
  .hdr{font-size:7pt;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-align:center;background:#000;color:#fff;padding:1mm 0;margin:2mm 0 1.5mm}
  table{width:100%;border-collapse:collapse}
  td{padding:.5mm 0;vertical-align:top;font-size:8.5pt}
  td.l{color:#555;width:42%}
  td.v{font-weight:600;text-align:right;color:#000}
  tr.b td{font-weight:900;font-size:10.5pt;color:#000}
  .po-id{font-size:14pt;font-weight:900;text-align:center;letter-spacing:-.5px;margin:1mm 0}
  .badge{display:block;font-size:8pt;font-weight:900;letter-spacing:2px;text-transform:uppercase;border:1.5px solid #000;padding:1mm 0;text-align:center;margin:1.5mm 0}
  .qr{display:block;width:44mm;height:44mm;margin:3mm auto 1mm}
  .scan{font-size:6.5pt;color:#888;text-align:center;letter-spacing:1px;text-transform:uppercase}
  @media print{@page{size:80mm auto;margin:3mm 2mm}body{width:76mm}}
</style></head>
<body>
  <div class="co">${coName}</div>
  <div class="sub">GSTIN: ${coGstin}<br>${coCity}, ${coState}</div>
  <hr class="solid">
  <div class="hdr">Purchase Order</div>
  <div class="po-id">${p.id}</div>
  <div class="sub">${fd(p.date)}</div>
  <div class="badge">${(p.status ?? '').toUpperCase()}</div>
  <hr class="rule">
  <div class="hdr">Vendor</div>
  <div style="text-align:center;font-weight:700;font-size:9.5pt;margin-bottom:1mm">${p.vendor_name ?? p.vendor_id ?? '\u2014'}</div>
  ${p.vendor_gstin ? `<div class="sub">GST: ${p.vendor_gstin}</div>` : ''}
  <hr class="rule">
  <div class="hdr">Material</div>
  <table>
    ${row('Variety', p.variety ?? '\u2014')}
    ${row('Blocks', String(p.blocks ?? '\u2014'))}
    ${row('Volume', `${p.cft ?? 0} CFT`)}
    ${row('Rate/CFT', fp(p.rate_per_cft_paise ?? 0))}
    ${row('HSN', hsnCode)}
  </table>
  <hr class="rule">
  <div class="hdr">Amount</div>
  <table>
    ${row('Material', fp(mat))}
    ${tr > 0 ? row('Transport', fp(tr)) : ''}
    ${row('Taxable', fp(tax))}
    ${row(`CGST @${CGST_RATE_LABEL}%`, fp(cg))}
    ${row(`SGST @${SGST_RATE_LABEL}%`, fp(sg))}
  </table>
  <hr class="solid">
  <table>${row('TOTAL', fp(tot), true)}</table>
  <hr class="rule">
  <div class="hdr">Payment</div>
  <table>
    ${row('Status', payLbl.toUpperCase())}
    ${paid > 0 ? row('Paid', fp(paid)) : ''}
    ${bal > 0 ? row('Balance Due', fp(bal)) : ''}
  </table>
  ${p.notes ? `<hr class="rule"><div style="font-size:7.5pt;color:#555;font-style:italic">Note: ${p.notes}</div>` : ''}
  ${statusHistory ? `<hr class="rule"><div class="hdr">Status History</div><table>${statusHistory}</table>` : ''}
  <hr class="rule">
  <img class="qr" src="${ribbonQR}" alt="QR">
  <div class="scan">Scan to open PO</div>
  <hr class="solid">
  <div style="font-size:6pt;color:#aaa;text-align:center;margin-top:1mm">Computer generated</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;
    const win = window.open('', '_blank', 'width=360,height=720');
    if (win) { win.document.write(html); win.document.close(); }
  }

  const [showGRNForm, setShowGRNForm] = useState(false);
  const [grnForm, setGrnForm] = useState({ ...BLANK_GRN });
  const [showTransportForm, setShowTransportForm] = useState(false);
  const [transportForm, setTransportForm] = useState({ ...BLANK_TRANSPORT });

  const transportors: any[] = (vendorsData as any)?.vendors || [];
  const grns: any[] = grnData?.receipts || [];

  const co = companyData?.company;
  const COMPANY  = co?.name    ?? 'MODERNEX STONES LLP';
  const GSTIN    = co?.gstin   ?? '33ACGFM7745J1ZW';
  const PAN      = co?.pan     ?? 'ACGFM7745J';
  const HSN      = co?.hsn     ?? '2516';
  const ADDRESS  = co
    ? `${co.address}, ${co.city}, ${co.state} — ${co.pincode}`
    : 'Krishnagiri, Tamil Nadu — 635203';

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--t3)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (error || !poData?.po) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: 'var(--rust)' }}>Purchase order not found.</p>
        <button onClick={() => navigate('/purchase')} style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}>← Back</button>
      </div>
    );
  }

  const po       = poData.po;
  const payments = (poData as any).payments ?? [];

  const taxable   = po.taxable_paise   ?? 0;
  const gst       = po.gst_paise       ?? 0;
  const total     = po.total_paise     ?? 0;
  const cgst      = Math.round(gst / 2);
  const sgst      = gst - cgst;
  const transport = po.transport_paise ?? 0;
  const paidPaise = po.paid_paise      ?? 0;
  const balance   = po.balance_paise   ?? (total - paidPaise);
  const payStatus = po.payment_status  ?? (paidPaise === 0 ? 'unpaid' : paidPaise >= total ? 'paid' : 'partial');
  const payMeta   = PAY_STATUS[payStatus] ?? PAY_STATUS.unpaid;

  function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    const amount = payAmountMode === 'full' ? balance : Math.round(payForm.amount_paise * 100);
    if (!amount || amount <= 0) { notify('Enter a valid amount', 'error'); return; }
    createPayment.mutate({
      type: 'payment',
      po_id: po.id,
      party: po.vendor_name ?? po.vendor_id,
      amount_paise: amount,
      mode: payForm.mode,
      utr: payForm.utr || undefined,
      date: payForm.date || undefined,
      notes: payForm.notes || undefined,
    }, {
      onSuccess: () => { setShowPayForm(false); setPayForm({ ...BLANK_FORM }); setPayAmountMode('full'); },
    });
  }

  async function handleCreateGRN(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createGRN.mutateAsync({ ...grnForm, po_id: po.id });
      notify('GRN created successfully', 'success');
      setShowGRNForm(false);
      setGrnForm({ ...BLANK_GRN });
      refetchGRN();
    } catch (err: any) { notify(err.message || 'Failed to create GRN', 'error'); }
  }

  function handleRecordMatch(force: boolean) {
    const amount = Math.round((parseFloat(matchInvAmount) || 0) * 100);
    if (amount <= 0) { notify('Enter the quarry invoice amount', 'error'); return; }
    recordMatch.mutate(
      { id: po.id, final_invoice_no: matchInvNo || undefined, final_invoice_paise: amount, force },
      {
        onSuccess: (res: any) => {
          if (res?.match?.matched) {
            notify('Three-way match confirmed ✓', 'success');
            setShowMatchForm(false);
          } else {
            notify(`Variance ${formatINR(Math.abs(res?.match?.variance_paise || 0))} exceeds tolerance — review and override if correct`, 'error');
          }
        },
        onError: (e: any) => notify(e.message || 'Failed to record match', 'error'),
      },
    );
  }

  async function handleSaveTransport(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateTransport.mutateAsync({
        ...transportForm,
        transport_paise: Math.round((transportForm.transport_paise as any) * 100),
      });
      notify('Transport details saved', 'success');
      setShowTransportForm(false);
    } catch (err: any) { notify(err.message || 'Failed to save transport', 'error'); }
  }
  const material  = taxable - transport;

  const statusMeta = STATUS_LABEL[po.status] ?? STATUS_LABEL.new;

  // Calm, unified button language: one rust primary, neutral ghosts elsewhere.
  const ghost: React.CSSProperties = {
    padding: '7px 14px', background: 'transparent', color: 'var(--t2)',
    border: '1px solid var(--bd)', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  };
  const primary: React.CSSProperties = {
    padding: '7px 16px', background: 'var(--rust)', color: '#fff',
    border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 700,
  };
  const softChip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 20,
    fontSize: 11, fontWeight: 700, background: 'var(--bg2)', color: 'var(--t2)', border: '1px solid var(--bd)',
  };

  return (
    <div className="receipt-wrap">
      {/* Toolbar */}
      <div className="receipt-toolbar no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/purchase')} style={ghost}>← Back</button>

          {/* Status — soft tint chip with a coloured dot */}
          <span style={softChip}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusMeta?.color }} />
            {statusMeta?.label}
          </span>

          {/* Forward action (primary rust) — Approve, or Close when eligible */}
          {(po.status === 'new' || po.status === 'received') && (
            <button
              onClick={() => {
                if (window.confirm(`Approve PO ${po.id}? Blocks will become available for production.`))
                  updateStatus.mutate({ id: po.id, status: 'approved' }, {
                    onSuccess: () => notify('PO approved — blocks ready for production', 'success'),
                    onError: (e: any) => notify(e.message || 'Failed', 'error'),
                  });
              }}
              disabled={updateStatus.isPending}
              style={primary}
            >✓ Approve PO</button>
          )}
          {po.status === 'approved' && po.matched_at && paidPaise >= total && (
            <button
              onClick={() => {
                if (window.confirm(`Close PO ${po.id}? It is matched and fully paid. This locks the order.`))
                  updateStatus.mutate({ id: po.id, status: 'closed' }, {
                    onSuccess: () => notify('PO closed', 'success'),
                    onError: (e: any) => notify(e.message || 'Failed', 'error'),
                  });
              }}
              disabled={updateStatus.isPending}
              style={primary}
            >◼ Close PO</button>
          )}

          {/* Secondary actions — neutral ghosts */}
          {po.status === 'approved' && (
            <button
              onClick={() => {
                if (window.confirm(`Unapprove PO ${po.id} and move it back to New? This will remove the approval.`))
                  updateStatus.mutate({ id: po.id, status: 'new' }, {
                    onSuccess: () => notify('PO unapproved — moved back to New', 'success'),
                    onError: (e: any) => notify(e.message || 'Failed', 'error'),
                  });
              }}
              disabled={updateStatus.isPending}
              style={ghost}
            >↩ Unapprove</button>
          )}
          {po.status !== 'cancelled' && po.status !== 'closed' && (
            <button
              onClick={() => {
                if (window.confirm(`Cancel PO ${po.id}? This cannot be undone.`))
                  updateStatus.mutate({ id: po.id, status: 'cancelled' }, {
                    onSuccess: () => notify('PO cancelled', 'success'),
                    onError: (e: any) => notify(e.message || 'Failed', 'error'),
                  });
              }}
              disabled={updateStatus.isPending}
              style={{ ...ghost, color: 'var(--red)' }}
            >✕ Cancel</button>
          )}

          {/* Payment status — soft tint chip with a coloured dot */}
          <span style={softChip}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: payMeta?.color }} />
            {payMeta?.label}
            {paidPaise > 0 && paidPaise < total && ` · Due ${formatINR(balance)}`}
            {paidPaise === 0 && ` · Due ${formatINR(total)}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {payStatus !== 'paid' && po.status !== 'cancelled' && (
            <button onClick={() => setShowPayForm(v => !v)}
              style={showPayForm ? ghost : primary}>
              {showPayForm ? 'Cancel' : '+ Record Payment'}
            </button>
          )}
          <button onClick={printBlockStickers}
            title={`Print ${po.blocks ?? 1} QR sticker${(po.blocks ?? 1) !== 1 ? 's' : ''} — one per block`}
            style={ghost}>
            ▤ Sticker{(po.blocks ?? 1) > 1 ? ` ×${po.blocks}` : ''}
          </button>
          {/* Print size group — neutral */}
          <div style={{ display: 'flex', border: '1px solid var(--bd)', borderRadius: 5, overflow: 'hidden' }}>
            <button onClick={() => window.print()} title="Print full A4 purchase order"
              style={{ ...ghost, border: 'none', borderRight: '1px solid var(--bd)', borderRadius: 0 }}>⎙ A4</button>
            <button onClick={printRibbon} title="Print condensed 80mm ribbon / thermal receipt"
              style={{ ...ghost, border: 'none', borderRadius: 0 }}>≡ 80mm</button>
          </div>
        </div>
      </div>

      {/* Record Payment form */}
      {showPayForm && (
        <div className="no-print" style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Record Payment — {po.id}</h3>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              Total {formatINR(total)} · Paid {formatINR(paidPaise)} · <strong style={{ color: 'var(--red)' }}>Due {formatINR(balance)}</strong>
            </span>
          </div>
          <form onSubmit={handleRecordPayment}>
            <div style={{ marginBottom: 14 }}>
              <label className="fl">Amount (₹) *</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button type="button"
                  onClick={() => setPayAmountMode('full')}
                  style={{ padding: '6px 16px', borderRadius: 4, border: '1px solid var(--bd)', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                    background: payAmountMode === 'full' ? 'var(--rust)' : 'transparent',
                    color: payAmountMode === 'full' ? 'white' : 'var(--t2)' }}>
                  Full Balance — {formatINR(balance)}
                </button>
                <button type="button"
                  onClick={() => setPayAmountMode('custom')}
                  style={{ padding: '6px 16px', borderRadius: 4, border: '1px solid var(--bd)', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                    background: payAmountMode === 'custom' ? 'var(--rust)' : 'transparent',
                    color: payAmountMode === 'custom' ? 'white' : 'var(--t2)' }}>
                  Custom Amount
                </button>
              </div>
              {payAmountMode === 'custom' && (
                <input type="number" min="0.01" step="0.01" required className="fi"
                  placeholder={`Enter amount (max ${(balance / 100).toFixed(2)})`}
                  value={payForm.amount_paise || ''}
                  onChange={e => setPayForm(f => ({ ...f, amount_paise: parseFloat(e.target.value) || 0 }))}
                  onFocus={selectOnFocus} />
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="fl">Mode *</label>
                <select required className="fsel" value={payForm.mode}
                  onChange={e => setPayForm(f => ({ ...f, mode: e.target.value }))}>
                  {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Date</label>
                <input type="date" className="fi" value={payForm.date}
                  onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="fl">UTR / Ref No</label>
                <input type="text" className="fi" value={payForm.utr}
                  onChange={e => setPayForm(f => ({ ...f, utr: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="fl">Notes</label>
                <input type="text" className="fi" value={payForm.notes}
                  onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={createPayment.isPending}
                style={{ padding: '8px 20px', background: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {createPayment.isPending ? 'Saving…' : `Record ${payAmountMode === 'full' ? formatINR(balance) : 'Payment'}`}
              </button>
              <button type="button" onClick={() => setShowPayForm(false)}
                style={{ padding: '8px 16px', background: 'transparent', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Three-Way Match panel (spec step 7) ── */}
      {po.status !== 'cancelled' && matchData && (
        <div className="no-print" style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, color: 'var(--t1)' }}>
              Three-Way Match
              {po.matched_at && <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, color: 'var(--sage)' }}>✓ Matched</span>}
            </h3>
            {!po.matched_at && (
              <button onClick={() => { setShowMatchForm(v => !v); setMatchInvNo(po.final_invoice_no || ''); setMatchInvAmount(po.final_invoice_paise ? String((po.final_invoice_paise / 100).toFixed(2)) : ''); }}
                style={{ padding: '6px 14px', background: showMatchForm ? 'var(--bg3)' : 'var(--rust)', color: showMatchForm ? 'var(--t1)' : '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {showMatchForm ? 'Cancel' : 'Record Invoice & Match'}
              </button>
            )}
          </div>

          {/* Three columns: Ordered / Received / Invoiced */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 6, padding: '10px 12px' }}>
              <div className="receipt-label" style={{ marginBottom: 6 }}>1 · Ordered (PO)</div>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>{matchData.ordered.blocks} blocks · {matchData.ordered.cft} CFT</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginTop: 4 }}>{formatINR(matchData.ordered.total_paise)}</div>
            </div>
            <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 6, padding: '10px 12px' }}>
              <div className="receipt-label" style={{ marginBottom: 6 }}>2 · Received (weighbridge)</div>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                {matchData.received.blocks_received} blocks · {matchData.received.cft_received} CFT
                {matchData.received.net_weight_kg > 0 && <> · <strong style={{ color: 'var(--gold)' }}>{(matchData.received.net_weight_kg / 1000).toFixed(3)} t</strong></>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                Expected: {formatINR(matchData.received.expected_paise)}
                {matchData.received.allowance_pct > 0 && ` (${matchData.received.allowance_pct}% allowance applied)`}
              </div>
            </div>
            <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 6, padding: '10px 12px' }}>
              <div className="receipt-label" style={{ marginBottom: 6 }}>3 · Invoiced (quarry)</div>
              {matchData.invoiced.final_invoice_paise != null ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--t2)' }}>{matchData.invoiced.final_invoice_no || '—'}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginTop: 4 }}>{formatINR(matchData.invoiced.final_invoice_paise)}</div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>not recorded yet</div>
              )}
            </div>
          </div>

          {/* Variance banner */}
          {matchData.variance_paise != null && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: matchData.within_tolerance ? 'var(--sageW)' : 'var(--redW)',
              color: matchData.within_tolerance ? 'var(--sage)' : 'var(--red)',
              border: `1px solid ${matchData.within_tolerance ? 'var(--sage)' : 'var(--red)'}`,
            }}>
              {matchData.within_tolerance ? '✓ Within tolerance' : '△ Over tolerance'}: invoiced
              {matchData.variance_paise >= 0 ? ' exceeds ' : ' below '}
              expected by {formatINR(Math.abs(matchData.variance_paise))}
              <span style={{ fontWeight: 400, opacity: 0.8 }}> (tolerance {formatINR(matchData.tolerance_paise)})</span>
            </div>
          )}

          {/* Record invoice form */}
          {showMatchForm && !po.matched_at && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
              <div>
                <label className="fl">Quarry Invoice No</label>
                <input type="text" className="fi" value={matchInvNo} onChange={e => setMatchInvNo(e.target.value)} placeholder="e.g. QRY-2291" />
              </div>
              <div>
                <label className="fl">Invoice Amount (₹) *</label>
                <input type="number" className="fi" step="0.01" min="0" value={matchInvAmount} onChange={e => setMatchInvAmount(e.target.value)} onFocus={selectOnFocus} placeholder="actual billed amount" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleRecordMatch(false)} disabled={recordMatch.isPending}
                  style={{ padding: '8px 16px', background: 'var(--rust)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                  {recordMatch.isPending ? 'Matching…' : 'Match'}
                </button>
                <button onClick={() => handleRecordMatch(true)} disabled={recordMatch.isPending} title="Confirm match despite variance (admin override)"
                  style={{ padding: '8px 12px', background: 'transparent', color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                  Override
                </button>
              </div>
            </div>
          )}
          {po.matched_at && po.status === 'approved' && paidPaise < total && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--t3)' }}>
              Matched — pay the balance {formatINR(balance)} in full, then the <strong>Close PO</strong> action unlocks.
            </div>
          )}
        </div>
      )}

      {/* Receipt card */}
      <div className="receipt">

        {/* Header */}
        <div className="receipt-hdr">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Syne, Inter, sans-serif', letterSpacing: '-0.5px', color: '#1a1612', lineHeight: 1.1 }}>
              {COMPANY.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(26,22,18,.6)', marginTop: 5, lineHeight: 1.7 }}>
              <div>GSTIN: <strong>{GSTIN}</strong> · PAN: <strong>{PAN}</strong></div>
              <div>{ADDRESS}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div>
              <div style={{
                display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: 2,
                textTransform: 'uppercase', color: '#ffffff', background: '#1a1612',
                padding: '4px 10px', borderRadius: 2, marginBottom: 10
              }}>Purchase Order</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 700, color: '#1a1612', letterSpacing: '-0.5px' }}>
                {po.id}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(26,22,18,.55)', marginTop: 4 }}>
                {po.date ? formatDate(po.date, 'long') : '—'}
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{
                  display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: 1,
                  textTransform: 'uppercase', color: statusMeta?.color,
                  border: `1px solid ${statusMeta?.color ?? 'var(--t3)'}`, padding: '2px 8px', borderRadius: 2
                }}>
                  {statusMeta?.label}
                </span>
              </div>
            </div>
            {qrDataUrl && (
              <div style={{ textAlign: 'center' }}>
                <img src={qrDataUrl} alt="PO QR" style={{ width: 72, height: 72, display: 'block', border: '1px solid rgba(26,22,18,.12)', borderRadius: 4 }} />
                <div style={{ fontSize: 7, color: 'rgba(26,22,18,.45)', marginTop: 3, letterSpacing: 0.5 }}>Scan to open</div>
              </div>
            )}
          </div>
        </div>

        <div className="receipt-rule" />

        {/* Vendor + Order Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ padding: '12px 14px', background: '#f7f5f2', borderRadius: 4, border: '1px solid rgba(26,22,18,.1)' }}>
            <div className="receipt-label" style={{ marginBottom: 6 }}>Vendor / Supplier</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1612', lineHeight: 1.3 }}>
              {po.vendor_name ?? po.vendor_id ?? '—'}
            </div>
            {po.vendor_gstin && (
              <div style={{ fontSize: 10, color: 'rgba(26,22,18,.55)', marginTop: 4 }}>
                GSTIN: {po.vendor_gstin}
              </div>
            )}
            {po.vendor_state && (
              <div style={{ fontSize: 10, color: 'rgba(26,22,18,.55)', marginTop: 3 }}>
                State: <strong>{po.vendor_state}</strong>
              </div>
            )}
            {po.vendor_contact && (
              <div style={{ fontSize: 10, color: 'rgba(26,22,18,.55)', marginTop: 3 }}>
                Contact: {po.vendor_contact}
              </div>
            )}
            {po.vendor_type && (
              <div style={{ fontSize: 10, color: 'rgba(26,22,18,.45)', marginTop: 3 }}>
                Type: {po.vendor_type}
                {po.vendor_msme ? ' · MSME' + (po.vendor_msme_number ? ` (${po.vendor_msme_number})` : '') : ''}
              </div>
            )}
          </div>

          <div style={{ padding: '12px 14px', background: '#f7f5f2', borderRadius: 4, border: '1px solid rgba(26,22,18,.1)' }}>
            <div className="receipt-label" style={{ marginBottom: 6 }}>Order Details</div>
            {po.block_number && <POInfoRow label="Block #" value={po.block_number} />}
            <POInfoRow label="Variety"    value={po.variety ?? '—'} />
            <POInfoRow label="Blocks"     value={String(po.blocks ?? '—')} />
            <POInfoRow label="Volume"     value={`${po.cft ?? 0} CFT`} />
            <POInfoRow label="Rate / CFT" value={formatINR(po.rate_per_cft_paise ?? 0)} />
            {po.incoterm && <POInfoRow label="Incoterm" value={po.incoterm} />}
            {po.allowance_pct > 0 && <POInfoRow label="Allowance" value={`${po.allowance_pct}% (rough-edge)`} />}
            {transport > 0 && <POInfoRow label="Transport" value={formatINR(transport)} />}
            <POInfoRow label="HSN Code"   value={HSN} />
            {po.defect_clause && (
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(26,22,18,.1)', fontSize: 10, color: 'rgba(26,22,18,.6)' }}>
                <strong>Defect clause:</strong> {po.defect_clause}
              </div>
            )}
            {po.inspection_id && (
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(26,22,18,.1)', fontSize: 10, color: 'rgba(26,22,18,.55)' }}>
                Raised from:{' '}
                <Link to={`/inspections/${po.inspection_id.replace(/\//g, '~')}`}
                  style={{ color: '#2563eb', fontWeight: 600 }}>{po.inspection_id}</Link>
              </div>
            )}
          </div>
        </div>

        {/* Line items table — kept narrow: tax split lives in totals */}
        <table className="receipt-tbl">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', width: '30%' }}>Description</th>
              <th>HSN</th>
              <th>Blocks</th>
              <th>Volume (CFT)</th>
              <th>Rate / CFT</th>
              {transport > 0 && <th>Transport</th>}
              <th>Taxable</th>
              <th>GST {GST_RATE_LABEL}%</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'left' }}>
                <strong>{po.variety ?? '—'}</strong>
                <div style={{ fontSize: 9, color: 'rgba(26,22,18,.45)', marginTop: 2 }}>
                  Raw Block · {po.vendor_type ?? 'Quarry'}
                </div>
              </td>
              <td>{HSN}</td>
              <td>{po.blocks ?? '—'}</td>
              <td>{po.cft ?? 0}</td>
              <td>{formatINR(po.rate_per_cft_paise ?? 0)}</td>
              {transport > 0 && <td>{formatINR(transport)}</td>}
              <td>{formatINR(taxable)}</td>
              <td>{formatINR(cgst + sgst)}</td>
              <td style={{ fontWeight: 700 }}>{formatINR(total)}</td>
            </tr>
          </tbody>
        </table>

        {/* Totals + Notes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 24, marginTop: 16, alignItems: 'start' }}>
          <div>
            {po.notes && (
              <div style={{ fontSize: 11, color: 'rgba(26,22,18,.75)', lineHeight: 1.7, padding: '10px 12px', background: '#f7f5f2', border: '1px solid rgba(26,22,18,.1)', borderRadius: 4 }}>
                <span style={{ fontWeight: 700, color: '#1a1612' }}>Notes: </span>{po.notes}
              </div>
            )}
          </div>
          <div style={{ border: '1px solid rgba(26,22,18,.12)', borderRadius: 4, overflow: 'hidden' }}>
            <TRow label="Material Value" value={formatINR(material)} />
            {transport > 0 && <TRow label="Transport" value={formatINR(transport)} />}
            <TRow label="Taxable Amount" value={formatINR(taxable)} />
            <TRow label={`CGST @${CGST_RATE_LABEL}%`} value={formatINR(cgst)} />
            <TRow label={`SGST @${SGST_RATE_LABEL}%`} value={formatINR(sgst)} />
            <TRow label="Grand Total" value={formatINR(total)} bold />
          </div>
        </div>

        {/* Amount in Words */}
        <div style={{ marginTop: 10, padding: '9px 14px', background: '#f7f5f2', border: '1px solid rgba(26,22,18,.1)', borderRadius: 4, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, color: 'rgba(26,22,18,.45)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, flexShrink: 0 }}>Amount in Words:</span>
          <span style={{ fontSize: 11, color: '#1a1612', fontWeight: 600, lineHeight: 1.5 }}>{amountInWords(total)}</span>
        </div>

        {/* Payment Summary + History */}
        <div style={{ marginTop: 14, border: '1px solid rgba(26,22,18,.1)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#1a1612', padding: '10px 14px', gap: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,.5)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 3 }}>Total</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{formatINR(total)}</div>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,.1)', borderRight: '1px solid rgba(255,255,255,.1)' }}>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,.5)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 3 }}>Paid</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: '#86efac' }}>{formatINR(paidPaise)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,.5)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 3 }}>Outstanding</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: balance > 0 ? '#fca5a5' : '#86efac' }}>{formatINR(balance)}</div>
            </div>
          </div>

          {payments.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}>
              <thead>
                <tr style={{ background: '#f7f5f2' }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left',  fontSize: 8, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(26,22,18,.5)', borderBottom: '1px solid rgba(26,22,18,.1)' }}>Date</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left',  fontSize: 8, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(26,22,18,.5)', borderBottom: '1px solid rgba(26,22,18,.1)' }}>Mode</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left',  fontSize: 8, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(26,22,18,.5)', borderBottom: '1px solid rgba(26,22,18,.1)' }}>UTR / Ref</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left',  fontSize: 8, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(26,22,18,.5)', borderBottom: '1px solid rgba(26,22,18,.1)' }}>Notes</th>
                  <th style={{ padding: '6px 12px', textAlign: 'right', fontSize: 8, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(26,22,18,.5)', borderBottom: '1px solid rgba(26,22,18,.1)' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pmt: any, i: number) => (
                  <tr key={pmt.id} style={{ background: i % 2 === 1 ? '#f7f5f2' : 'white' }}>
                    <td style={{ padding: '6px 12px', color: '#1a1612', borderBottom: '1px solid rgba(26,22,18,.06)' }}>{pmt.date ?? '—'}</td>
                    <td style={{ padding: '6px 12px', color: '#1a1612', borderBottom: '1px solid rgba(26,22,18,.06)' }}>{pmt.mode}</td>
                    <td style={{ padding: '6px 12px', color: 'rgba(26,22,18,.6)', borderBottom: '1px solid rgba(26,22,18,.06)' }}>{pmt.utr ?? '—'}</td>
                    <td style={{ padding: '6px 12px', color: 'rgba(26,22,18,.6)', borderBottom: '1px solid rgba(26,22,18,.06)' }}>{pmt.notes ?? '—'}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: '#15803d', borderBottom: '1px solid rgba(26,22,18,.06)' }}>{formatINR(pmt.amount_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '12px 14px', fontSize: 10, color: 'rgba(26,22,18,.4)', fontStyle: 'italic' }}>
              No payments recorded yet.
            </div>
          )}
        </div>

        {/* ── Transport Bill Section (no-print = screen only) ── */}
        <div className="no-print" style={{ marginTop: 20, border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', backgroundColor: 'var(--bg2)' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Transport Details</span>
              {po.delivered_at_site ? <span style={{ marginLeft: 10, fontSize: 11, padding: '2px 8px', borderRadius: 10, backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 600 }}>✓ Delivered at Site</span> : null}
              {po.transport_bill_no && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--t3)' }}>Bill: {po.transport_bill_no}</span>}
              {po.lr_no && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--t3)' }}>LR: {po.lr_no}</span>}
              {po.vehicle_no && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--t3)' }}>Vehicle: {po.vehicle_no}</span>}
            </div>
            <button onClick={() => setShowTransportForm(!showTransportForm)} style={{ padding: '5px 14px', fontSize: 12, border: '1px solid var(--bd)', borderRadius: 6, backgroundColor: 'var(--bg1)', color: 'var(--t1)', cursor: 'pointer' }}>
              {showTransportForm ? 'Cancel' : (po.transport_vendor_id ? 'Edit Transport' : '+ Add Transport')}
            </button>
          </div>
          {showTransportForm && (
            <form onSubmit={handleSaveTransport} style={{ padding: 16, borderTop: '1px solid var(--bd)', backgroundColor: 'var(--bg1)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="fl">Transporter</label>
                  <select value={transportForm.transport_vendor_id} onChange={e => setTransportForm({ ...transportForm, transport_vendor_id: e.target.value })} className="fsel">
                    <option value="">— Select —</option>
                    {transportors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div><label className="fl">Bill No</label><input type="text" value={transportForm.transport_bill_no} onChange={e => setTransportForm({ ...transportForm, transport_bill_no: e.target.value })} className="fi" placeholder="e.g. TB-2025-001" /></div>
                <div><label className="fl">Bill Date</label><input type="date" value={transportForm.transport_bill_date} onChange={e => setTransportForm({ ...transportForm, transport_bill_date: e.target.value })} className="fi" /></div>
                <div><label className="fl">Amount (₹)</label><input type="number" value={transportForm.transport_paise || ''} onChange={e => setTransportForm({ ...transportForm, transport_paise: parseFloat(e.target.value) || 0 })} className="fi" min="0" step="0.01" /></div>
                <div><label className="fl">LR No</label><input type="text" value={transportForm.lr_no} onChange={e => setTransportForm({ ...transportForm, lr_no: e.target.value })} className="fi" /></div>
                <div><label className="fl">Vehicle No</label><input type="text" value={transportForm.vehicle_no} onChange={e => setTransportForm({ ...transportForm, vehicle_no: e.target.value })} className="fi" placeholder="e.g. TN-39-AB-1234" /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                  <input type="checkbox" id="delivered" checked={transportForm.delivered_at_site} onChange={e => setTransportForm({ ...transportForm, delivered_at_site: e.target.checked })} />
                  <label htmlFor="delivered" style={{ cursor: 'pointer', fontSize: 13 }}>Delivered at Site</label>
                </div>
                {transportForm.delivered_at_site && <div><label className="fl">Delivered Date</label><input type="date" value={transportForm.delivered_date} onChange={e => setTransportForm({ ...transportForm, delivered_date: e.target.value })} className="fi" /></div>}
              </div>
              <button type="submit" disabled={updateTransport.isPending} style={{ padding: '8px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {updateTransport.isPending ? 'Saving...' : 'Save Transport'}
              </button>
            </form>
          )}
        </div>

        {/* ── GRN Section ── */}
        <div className="no-print" style={{ marginTop: 16, border: '1px solid var(--bd)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', backgroundColor: 'var(--bg2)' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Goods Receipt Notes ({grns.length})</span>
            <button onClick={() => setShowGRNForm(!showGRNForm)} style={{ padding: '5px 14px', fontSize: 12, border: '1px solid var(--bd)', borderRadius: 6, backgroundColor: 'var(--bg1)', color: 'var(--t1)', cursor: 'pointer' }}>
              {showGRNForm ? 'Cancel' : '+ Record GRN'}
            </button>
          </div>
          {showGRNForm && (
            <form onSubmit={handleCreateGRN} style={{ padding: 16, borderTop: '1px solid var(--bd)', backgroundColor: 'var(--bg1)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><label className="fl">Blocks Received *</label><input type="number" value={grnForm.blocks_received || ''} onChange={e => setGrnForm({ ...grnForm, blocks_received: parseInt(e.target.value) || 0 })} required className="fi" min="1" /></div>
                <div><label className="fl">CFT Received *</label><input type="number" step="0.01" value={grnForm.cft_received || ''} onChange={e => setGrnForm({ ...grnForm, cft_received: parseFloat(e.target.value) || 0 })} required className="fi" min="0" /></div>
                <div>
                  <label className="fl">Net Weight (kg) — weighbridge</label>
                  <input type="number" step="0.1" value={grnForm.net_weight_kg || ''} onChange={e => setGrnForm({ ...grnForm, net_weight_kg: parseFloat(e.target.value) || 0 })} className="fi" min="0" placeholder="certified scale" />
                  {grnForm.net_weight_kg > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--gold)', marginTop: 3 }}>
                      = {(grnForm.net_weight_kg / 1000).toFixed(3)} tonnes
                    </div>
                  )}
                </div>
                <div><label className="fl">Scale Ticket No</label><input type="text" value={grnForm.scale_ticket_no} onChange={e => setGrnForm({ ...grnForm, scale_ticket_no: e.target.value })} className="fi" placeholder="weighbridge ref" /></div>
                <div><label className="fl">Vehicle No</label><input type="text" value={grnForm.vehicle_no} onChange={e => setGrnForm({ ...grnForm, vehicle_no: e.target.value })} className="fi" /></div>
                <div><label className="fl">LR No</label><input type="text" value={grnForm.lr_no} onChange={e => setGrnForm({ ...grnForm, lr_no: e.target.value })} className="fi" /></div>
                <div style={{ gridColumn: '1/-1' }}><label className="fl">Condition Note</label><input type="text" value={grnForm.condition_note} onChange={e => setGrnForm({ ...grnForm, condition_note: e.target.value })} className="fi" placeholder="Any damage / short delivery / water-spray crack check" /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                  <input type="checkbox" id="qcpass" checked={grnForm.qc_pass} onChange={e => setGrnForm({ ...grnForm, qc_pass: e.target.checked })} />
                  <label htmlFor="qcpass" style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>QC Pass</label>
                </div>
                {!grnForm.qc_pass && <div style={{ gridColumn: '1/-1' }}><label className="fl">QC Notes</label><input type="text" value={grnForm.qc_notes} onChange={e => setGrnForm({ ...grnForm, qc_notes: e.target.value })} className="fi" placeholder="Reason for hold/fail" /></div>}
              </div>
              <button type="submit" disabled={createGRN.isPending} style={{ padding: '8px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {createGRN.isPending ? 'Creating...' : 'Create GRN'}
              </button>
            </form>
          )}
          {grns.length > 0 && (
            <div style={{ borderTop: '1px solid var(--bd)' }}>
              {grns.map((g: any) => (
                <div key={g.id} style={{ display: 'flex', gap: 16, padding: '10px 16px', borderBottom: '1px solid var(--bd)', fontSize: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, minWidth: 120 }}>{g.id}</span>
                  <span style={{ color: 'var(--t3)' }}>{g.date}</span>
                  <span>{g.blocks_received} blocks · {g.cft_received} CFT</span>
                  {g.net_weight_kg > 0 && (
                    <span style={{ fontWeight: 700, color: 'var(--gold)' }}>
                      ⊜ {(g.net_weight_kg / 1000).toFixed(3)} t
                      {g.scale_ticket_no && <span style={{ fontWeight: 400, color: 'var(--t3)' }}> (#{g.scale_ticket_no})</span>}
                    </span>
                  )}
                  {g.vehicle_no && <span style={{ color: 'var(--t3)' }}>⊟ {g.vehicle_no}</span>}
                  {g.lr_no && <span style={{ color: 'var(--t3)' }}>LR: {g.lr_no}</span>}
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, backgroundColor: g.qc_pass ? '#dcfce7' : '#fee2e2', color: g.qc_pass ? '#15803d' : '#b91c1c' }}>
                    {g.qc_pass ? 'QC ✓' : 'QC Hold'}
                  </span>
                  {g.condition_note && <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>{g.condition_note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Terms */}
        <div style={{ marginTop: 14, padding: '10px 14px', background: '#f7f5f2', border: '1px solid rgba(26,22,18,.1)', borderRadius: 4, fontSize: 10, color: 'rgba(26,22,18,.65)', lineHeight: 1.9 }}>
          <div className="receipt-label" style={{ marginBottom: 6 }}>Terms &amp; Conditions</div>
          <div>1. Goods once dispatched will not be taken back without prior approval.</div>
          <div>2. Payment as per agreed credit terms. MSME vendors: within 45 days (MSMED Act 2006).</div>
          <div>3. All disputes subject to {co?.city ?? 'Krishnagiri'} jurisdiction.</div>
          <div>4. This PO is subject to quality inspection on receipt.</div>
        </div>

        {/* Status Audit Trail */}
        <div style={{ marginTop: 14, padding: '10px 14px', background: '#f7f5f2', border: '1px solid rgba(26,22,18,.1)', borderRadius: 4 }}>
          <div className="receipt-label" style={{ marginBottom: 8 }}>Status History</div>
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {[
              { key: 'created_at',   label: 'Created',   color: '#2563eb' },
              { key: 'received_at',  label: 'Received',  color: '#64748b' },
              { key: 'approved_at',  label: 'Approved',  color: '#16a34a' },
              { key: 'cancelled_at', label: 'Cancelled', color: '#dc2626' },
            ].map(({ key, label, color }, idx) => {
              const ts = (po as any)[key];
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  {idx > 0 && (
                    <div style={{ width: 24, height: 1, background: ts ? color : 'rgba(26,22,18,.15)', margin: '0 2px', alignSelf: 'center' }} />
                  )}
                  <div style={{ textAlign: 'center', opacity: ts ? 1 : 0.35 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: ts ? color : 'rgba(26,22,18,.2)', margin: '0 auto 4px' }} />
                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: ts ? color : 'rgba(26,22,18,.4)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 9, color: 'rgba(26,22,18,.6)', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
                      {ts ? new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, marginTop: 28, paddingTop: 16, borderTop: '2px solid rgba(26,22,18,.12)', alignItems: 'end' }}>
          <div style={{ fontSize: 10, color: 'rgba(26,22,18,.45)', lineHeight: 1.9 }}>
            <div>This is a computer-generated purchase order.</div>
            <div>Prepared by: <strong style={{ color: 'rgba(26,22,18,.65)' }}>{po.created_by ?? '—'}</strong></div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 160 }}>
            <div style={{ fontSize: 10, color: 'rgba(26,22,18,.55)', marginBottom: 40, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              For {COMPANY}
            </div>
            <div style={{ borderTop: '1px solid rgba(26,22,18,.3)', paddingTop: 7, fontSize: 9, color: 'rgba(26,22,18,.55)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              Authorised Signatory
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function POInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 5, fontSize: 10 }}>
      <span style={{ color: 'rgba(26,22,18,.5)' }}>{label}</span>
      <strong style={{ color: '#1a1612', textAlign: 'right' }}>{value}</strong>
    </div>
  );
}

function TRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: bold ? '9px 12px' : '6px 12px',
      background: bold ? '#1a1612' : 'transparent',
      borderTop: '1px solid rgba(26,22,18,.1)',
      fontWeight: bold ? 700 : 400,
      fontSize: bold ? 13 : 11,
    }}>
      <span style={{ color: bold ? '#ffffff' : 'rgba(26,22,18,.65)' }}>{label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: bold ? '#ffffff' : '#1a1612', fontWeight: bold ? 700 : 500 }}>
        {value}
      </span>
    </div>
  );
}
