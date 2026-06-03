import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { CGST_RATE_LABEL, IGST_RATE_LABEL, SGST_RATE_LABEL } from '@modernex/shared';
import { useCollectionAccounts, useInvoice, useCompany } from '@/hooks/useApi';
import { formatINR, formatDate } from '@/utils/format';

function buildUpiUri({ upiId, payeeName, amountPaise, invoiceId, note }: {
  upiId: string;
  payeeName?: string;
  amountPaise?: number;
  invoiceId?: string;
  note?: string;
}) {
  const params = new URLSearchParams();
  params.set('pa', upiId);
  if (payeeName) params.set('pn', payeeName);
  if (typeof amountPaise === 'number' && amountPaise > 0) params.set('am', (amountPaise / 100).toFixed(2));
  if (invoiceId) params.set('tr', invoiceId);
  if (note) params.set('tn', note);
  params.set('cu', 'INR');
  return `upi://pay?${params.toString()}`;
}

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

export function InvoiceReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const decodedId = id ? id.replace(/~/g, '/') : '';
  const { data: invoice, isLoading, error } = useInvoice(decodedId, { enabled: !!decodedId });
  const { data: accountsData } = useCollectionAccounts();
  const { data: companyData } = useCompany();
  const co = companyData?.company;
  const COMPANY = co?.name ?? 'MODERNEX STONES LLP';
  const GSTIN = co?.gstin ?? '33ACGFM7745J1ZW';
  const PAN = co?.pan ?? 'ACGFM7745J';
  const HSN = co?.hsn ?? '2516';
  const ADDRESS = co ? `${co.address}, ${co.city}, ${co.state} — ${co.pincode}` : 'Krishnagiri, Tamil Nadu — 635203';
  const [eInvoiceQr, setEInvoiceQr] = React.useState<string | null>(null);
  const [paymentQr, setPaymentQr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const signedQrPayload = (invoice as any)?.signed_qr_payload ?? (invoice as any)?.signedQrPayload ?? (invoice as any)?.qr_code ?? null;

    if (!signedQrPayload) {
      setEInvoiceQr(null);
      return;
    }

    let active = true;
    QRCode.toDataURL(String(signedQrPayload), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 140,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (active) setEInvoiceQr(dataUrl);
      })
      .catch(() => {
        if (active) setEInvoiceQr(null);
      });

    return () => {
      active = false;
    };
  }, [invoice]);

  React.useEffect(() => {
    const inv = invoice as any;
    const accounts = accountsData?.accounts || [];
    const collectionAccount = accounts.find((account: any) => account.id === inv?.collection_account_id)
      || accounts.find((account: any) => account.is_default && account.active);
    const upiId = collectionAccount?.upi_id;
    const upiName = collectionAccount?.upi_name || collectionAccount?.account_holder || COMPANY;

    if (!upiId || !inv?.id) {
      setPaymentQr(null);
      return;
    }

    let active = true;
    const uri = buildUpiUri({
      upiId,
      payeeName: upiName,
      amountPaise: inv.total_paise ?? inv.grand_total_paise ?? inv.totalPaise ?? inv.grandTotalPaise ?? 0,
      invoiceId: inv.id,
      note: `${upiName} · ${inv.id}`,
    });

    QRCode.toDataURL(uri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 160,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (active) setPaymentQr(dataUrl);
      })
      .catch(() => {
        if (active) setPaymentQr(null);
      });

    return () => {
      active = false;
    };
  }, [accountsData, invoice]);

  if (isLoading) return <div className="page"><p style={{ color: 'var(--t3)', marginTop: 40 }}>Loading invoice…</p></div>;
  if (error || !invoice) return <div className="page"><p style={{ color: 'var(--t3)', marginTop: 40 }}>Invoice not found.</p></div>;

  const inv = invoice as any;
  const items: any[] = inv.items || [];
  const grandTotal = inv.grand_total_paise ?? inv.grandTotalPaise ?? inv.total_paise ?? 0;
  const taxable   = inv.taxable_paise ?? inv.taxableAmountPaise ?? 0;
  const cgst      = inv.cgst_paise ?? inv.cgstPaise ?? 0;
  const sgst      = inv.sgst_paise ?? inv.sgstPaise ?? 0;
  const igst      = inv.igst_paise ?? inv.igstPaise ?? 0;
  const roundOff  = inv.round_off_paise ?? inv.roundOffPaise ?? 0;
  const invDate   = inv.date ?? inv.invoiceDate ?? inv.created_at ?? inv.createdAt ?? '';
  const invNum    = inv.invoice_number ?? inv.invoiceNumber ?? inv.id ?? '';
  const pos       = inv.place_of_supply ?? inv.placeOfSupply ?? inv.customer_state ?? inv.customerState ?? '';
  const irn       = inv.irn;
  const ackNo     = inv.ack_no ?? inv.ackNo;
  const ackDate   = inv.ack_date ?? inv.ackDate;
  const isIGST    = igst > 0;
  const accounts = accountsData?.accounts || [];
  const paymentAccount = accounts.find((account: any) => account.id === inv.collection_account_id)
    || accounts.find((account: any) => account.is_default && account.active);
  const paymentUpiId = paymentAccount?.upi_id;
  const paymentUpiName = paymentAccount?.upi_name || paymentAccount?.account_holder || COMPANY;
  const grossSubtotal = items.reduce((sum, item) => {
    const qty = Number(item.qty ?? item.quantity ?? 0);
    const uomQty = Number(item.uom_qty ?? item.uomQty ?? item.sqft ?? 1);
    const rate = Number(item.rate_paise ?? item.ratePaise ?? 0);
    const lineGross = Number(item.line_total_paise ?? item.lineTotalPaise ?? Math.round(rate * uomQty * qty));
    return sum + lineGross;
  }, 0);
  const derivedItems = items.map((item, index) => {
    const qty = Number(item.qty ?? item.quantity ?? 0);
    const uomQty = Number(item.uom_qty ?? item.uomQty ?? item.sqft ?? 1);
    const rate = Number(item.rate_paise ?? item.ratePaise ?? 0);
    const lineGross = Number(item.line_total_paise ?? item.lineTotalPaise ?? Math.round(rate * uomQty * qty));
    const existingTaxable = item.taxable_paise ?? item.taxableAmountPaise;
    const existingCgst = item.cgst_paise ?? item.cgstPaise;
    const existingSgst = item.sgst_paise ?? item.sgstPaise;
    const existingIgst = item.igst_paise ?? item.igstPaise;
    const existingTotal = item.total_paise ?? item.totalPaise;

    if ([existingTaxable, existingCgst, existingSgst, existingIgst, existingTotal].some((value) => value != null)) {
      const resolvedTaxable = Number(existingTaxable ?? lineGross);
      const resolvedCgst = Number(existingCgst ?? 0);
      const resolvedSgst = Number(existingSgst ?? 0);
      const resolvedIgst = Number(existingIgst ?? 0);
      const resolvedTotal = Number(existingTotal ?? (resolvedTaxable + resolvedCgst + resolvedSgst + resolvedIgst));
      return { ...item, resolvedTaxable, resolvedCgst, resolvedSgst, resolvedIgst, resolvedTotal };
    }

    if (!grossSubtotal || !taxable) {
      return {
        ...item,
        resolvedTaxable: lineGross,
        resolvedCgst: 0,
        resolvedSgst: 0,
        resolvedIgst: 0,
        resolvedTotal: lineGross,
      };
    }

    if (index === items.length - 1) {
      const allocated = items.slice(0, index).reduce((acc, current: any) => {
        const currentQty = Number(current.qty ?? current.quantity ?? 0);
        const currentUomQty = Number(current.uom_qty ?? current.uomQty ?? current.sqft ?? 1);
        const currentRate = Number(current.rate_paise ?? current.ratePaise ?? 0);
        const currentGross = Number(current.line_total_paise ?? current.lineTotalPaise ?? Math.round(currentRate * currentUomQty * currentQty));
        const share = grossSubtotal > 0 ? currentGross / grossSubtotal : 0;
        acc.taxable += Math.round(taxable * share);
        acc.cgst += Math.round(cgst * share);
        acc.sgst += Math.round(sgst * share);
        acc.igst += Math.round(igst * share);
        return acc;
      }, { taxable: 0, cgst: 0, sgst: 0, igst: 0 });

      const resolvedTaxable = taxable - allocated.taxable;
      const resolvedCgst = cgst - allocated.cgst;
      const resolvedSgst = sgst - allocated.sgst;
      const resolvedIgst = igst - allocated.igst;
      const resolvedTotal = resolvedTaxable + resolvedCgst + resolvedSgst + resolvedIgst;
      return { ...item, resolvedTaxable, resolvedCgst, resolvedSgst, resolvedIgst, resolvedTotal };
    }

    const share = grossSubtotal > 0 ? lineGross / grossSubtotal : 0;
    const resolvedTaxable = Math.round(taxable * share);
    const resolvedCgst = Math.round(cgst * share);
    const resolvedSgst = Math.round(sgst * share);
    const resolvedIgst = Math.round(igst * share);
    const resolvedTotal = resolvedTaxable + resolvedCgst + resolvedSgst + resolvedIgst;
    return { ...item, resolvedTaxable, resolvedCgst, resolvedSgst, resolvedIgst, resolvedTotal };
  });

  async function printRibbon() {
    const url = window.location.href;
    const qr = await QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: '#000', light: '#fff' }, errorCorrectionLevel: 'M' });
    const fp = (v: number) => '₹' + (v / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const fd = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const coCity = co?.city ?? 'Krishnagiri';
    const coState = co?.state ?? 'Tamil Nadu';
    const itemRows = derivedItems.map((it: any) => {
      const qty = Number(it.qty ?? it.quantity ?? 0);
      const uomQty = Number(it.uom_qty ?? it.sqft ?? 1);
      const rate = Number(it.rate_paise ?? it.ratePaise ?? 0);
      const name = it.variety ?? it.description ?? it.product_id ?? '—';
      const sub = `${qty}${it.uom ? ' ' + it.uom : ''} × ${fp(rate)}${uomQty && uomQty !== 1 ? ` × ${uomQty}` : ''}`;
      return `<tr><td class="nm">${name}<div class="sub">${sub}</div></td><td class="v">${fp(it.resolvedTotal)}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${invNum} — 80mm</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#fff;font-family:'Courier New',Courier,monospace;font-size:9pt;color:#000;width:76mm;padding:4mm 3mm}
  .co{font-size:11pt;font-weight:900;letter-spacing:1px;text-transform:uppercase;text-align:center;margin-bottom:1mm}
  .sub{font-size:7pt;color:#555;text-align:center;line-height:1.6}
  .rule{border:none;border-top:1px dashed #000;margin:2.5mm 0}
  .solid{border:none;border-top:2px solid #000;margin:2.5mm 0}
  .hdr{font-size:7pt;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-align:center;background:#000;color:#fff;padding:1mm 0;margin:2mm 0 1.5mm}
  table{width:100%;border-collapse:collapse}
  td{padding:.6mm 0;vertical-align:top;font-size:8.5pt}
  td.l{color:#555;width:50%}
  td.v{font-weight:700;text-align:right;color:#000;white-space:nowrap}
  td.nm{font-weight:700}
  td.nm .sub{font-size:7pt;color:#555;text-align:left;font-weight:400}
  tr.b td{font-weight:900;font-size:11pt}
  .inv-id{font-size:13pt;font-weight:900;text-align:center;letter-spacing:-.5px;margin:1mm 0}
  .qr{display:block;width:42mm;height:42mm;margin:3mm auto 1mm}
  .scan{font-size:6.5pt;color:#888;text-align:center;letter-spacing:1px;text-transform:uppercase}
  .foot{font-size:6.5pt;color:#888;text-align:center;margin-top:2mm;line-height:1.6}
  @media print{@page{size:80mm auto;margin:3mm 2mm}body{width:76mm}}
</style></head>
<body>
  <div class="co">${COMPANY}</div>
  <div class="sub">GSTIN: ${GSTIN}<br>${coCity}, ${coState}</div>
  <hr class="solid">
  <div class="hdr">Tax Invoice</div>
  <div class="inv-id">${invNum}</div>
  <div class="sub">${fd(invDate)}</div>
  <hr class="rule">
  <div class="hdr">Bill To</div>
  <div style="text-align:center;font-weight:700;font-size:9.5pt;margin-bottom:1mm">${inv.customer_name ?? inv.customerName ?? '—'}</div>
  ${(inv.customer_gstin ?? inv.customerGstin) ? `<div class="sub">GST: ${inv.customer_gstin ?? inv.customerGstin}</div>` : ''}
  ${pos ? `<div class="sub">Place of supply: ${pos}</div>` : ''}
  <hr class="rule">
  <div class="hdr">Items</div>
  <table>${itemRows}</table>
  <hr class="rule">
  <table>
    <tr><td class="l">Taxable</td><td class="v">${fp(taxable)}</td></tr>
    ${isIGST
      ? `<tr><td class="l">IGST ${IGST_RATE_LABEL}</td><td class="v">${fp(igst)}</td></tr>`
      : `<tr><td class="l">CGST ${CGST_RATE_LABEL}</td><td class="v">${fp(cgst)}</td></tr>
         <tr><td class="l">SGST ${SGST_RATE_LABEL}</td><td class="v">${fp(sgst)}</td></tr>`}
    ${roundOff ? `<tr><td class="l">Round off</td><td class="v">${fp(roundOff)}</td></tr>` : ''}
  </table>
  <hr class="solid">
  <table><tr class="b"><td>TOTAL</td><td class="v">${fp(grandTotal)}</td></tr></table>
  <hr class="rule">
  <div class="sub" style="font-weight:600;color:#000">${amountInWords(grandTotal)}</div>
  <img class="qr" src="${qr}"/>
  <div class="scan">Scan to view invoice</div>
  <div class="foot">This is a computer-generated invoice.<br>Thank you for your business!</div>
  <script>window.onload=()=>{window.print();}<\/script>
</body></html>`;
    const w = window.open('', '_blank', 'width=380,height=640');
    if (w) { w.document.write(html); w.document.close(); }
  }

  const handleBack = () => {
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.referrer) {
      try {
        const referrer = new URL(document.referrer);
        if (referrer.origin === window.location.origin && referrer.pathname !== window.location.pathname) {
          navigate(`${referrer.pathname}${referrer.search}${referrer.hash}`);
          return;
        }
      } catch {
        // Ignore invalid referrer and use fallback navigation below.
      }
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/accounts');
  };

  return (
    <div className="receipt-wrap">
      {/* Screen toolbar */}
      <div className="receipt-toolbar no-print">
        <button
          onClick={handleBack}
          style={{ padding: '8px 16px', border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer', fontSize: 12, background: 'var(--bg2)', color: 'var(--t1)' }}
        >
          ← Back
        </button>
        <div style={{ display: 'flex', border: '1px solid var(--bd)', borderRadius: 5, overflow: 'hidden' }}>
          <button
            onClick={() => window.print()}
            title="Print full A4 tax invoice / save as PDF"
            style={{ padding: '8px 16px', background: 'var(--t1)', color: 'var(--bg1)', border: 'none', borderRight: '1px solid var(--bd)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            ⎙ A4 / PDF
          </button>
          <button
            onClick={printRibbon}
            title="Print condensed 80mm thermal receipt"
            style={{ padding: '8px 16px', background: 'var(--t1)', color: 'var(--bg1)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            ≡ 80mm
          </button>
        </div>
      </div>

      {/* Receipt card */}
      <div className="receipt">

        {/* Header */}
        <div className="receipt-hdr">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Syne, Inter, sans-serif', letterSpacing: '-0.5px', color: '#1a1612', lineHeight: 1.1 }}>
              {COMPANY.toUpperCase()}
            </div>
            {(co?.trade_name && co.trade_name !== co.name) && (
              <div style={{ fontSize: 10, color: 'rgba(26,22,18,.5)', marginTop: 2 }}>{co.trade_name}</div>
            )}
            <div style={{ fontSize: 10, color: 'rgba(26,22,18,.6)', marginTop: 5, lineHeight: 1.7 }}>
              <div>GSTIN: <strong>{GSTIN}</strong> · PAN: <strong>{PAN}</strong></div>
              <div>{ADDRESS}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{
              display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: 2,
              textTransform: 'uppercase', color: '#ffffff', background: '#1a1612',
              padding: '4px 10px', borderRadius: 2, marginBottom: 10
            }}>Tax Invoice</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 700, color: '#1a1612', letterSpacing: '-0.5px' }}>
              {invNum}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(26,22,18,.55)', marginTop: 4 }}>
              {invDate ? formatDate(invDate, 'long') : '—'}
            </div>
            {inv.status && inv.status !== 'final' && (
              <div style={{ marginTop: 6, display: 'inline-block', fontSize: 8, fontWeight: 700, color: '#b04030', border: '1px solid #b04030', padding: '2px 6px', borderRadius: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                {inv.status}
              </div>
            )}
          </div>
        </div>

        <div className="receipt-rule" />

        {/* Bill To + Supply */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ padding: '12px 14px', background: '#f7f5f2', borderRadius: 4, border: '1px solid rgba(26,22,18,.1)' }}>
            <div className="receipt-label" style={{ marginBottom: 6 }}>Bill To</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1612', lineHeight: 1.3 }}>
              {inv.customer_name ?? inv.customerName ?? '—'}
            </div>
            {(inv.customer_gstin ?? inv.customerGstin) && (
              <div style={{ fontSize: 10, color: 'rgba(26,22,18,.55)', marginTop: 4, letterSpacing: '0.3px' }}>
                GSTIN: {inv.customer_gstin ?? inv.customerGstin}
              </div>
            )}
            {(inv.customer_address ?? inv.customerAddress) && (
              <div style={{ fontSize: 10, color: 'rgba(26,22,18,.65)', marginTop: 4, lineHeight: 1.7 }}>
                {inv.customer_address ?? inv.customerAddress}
              </div>
            )}
            <div style={{ fontSize: 10, color: 'rgba(26,22,18,.55)', marginTop: 3 }}>
              State: <strong>{inv.customer_state ?? inv.customerState ?? '—'}</strong>
            </div>
          </div>
          <div style={{ padding: '12px 14px', background: '#f7f5f2', borderRadius: 4, border: '1px solid rgba(26,22,18,.1)' }}>
            <div className="receipt-label" style={{ marginBottom: 6 }}>Supply Info</div>
            <InfoRow label="Place of Supply" value={pos || '—'} />
            <InfoRow label="HSN Code" value={HSN} />
            <InfoRow label="Tax Type" value={isIGST ? `IGST @${IGST_RATE_LABEL}%` : `CGST @${CGST_RATE_LABEL}% + SGST @${SGST_RATE_LABEL}%`} />
            {inv.due_date && <InfoRow label="Due Date" value={formatDate(inv.due_date, 'short')} />}
          </div>
        </div>

        {/* Line items */}
        <table className="receipt-tbl">
          <thead>
            <tr>
              <th style={{ width: 24 }}>#</th>
              <th style={{ textAlign: 'left', minWidth: 140 }}>Description</th>
              <th>HSN</th>
              <th>UOM</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Taxable</th>
              {isIGST
                ? <th>IGST {IGST_RATE_LABEL}%</th>
                : <><th>CGST {CGST_RATE_LABEL}%</th><th>SGST {SGST_RATE_LABEL}%</th></>
              }
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {derivedItems.map((item: any, i: number) => {
              const desc     = item.description ?? item.variety ?? item.product_id ?? item.productId ?? '—';
              const hsn      = item.hsn ?? item.hsn_code ?? item.hsnCode ?? '2516';
              const uom      = item.uom ?? '—';
              const qty      = item.qty ?? item.quantity ?? 0;
              const rate     = item.rate_paise ?? item.ratePaise ?? 0;
              const taxAmt   = item.resolvedTaxable;
              const iCgst    = item.resolvedCgst;
              const iSgst    = item.resolvedSgst;
              const iIgst    = item.resolvedIgst;
              const iTotal   = item.resolvedTotal;
              return (
                <tr key={i}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ textAlign: 'left' }}>{desc}</td>
                  <td>{hsn}</td>
                  <td>{uom}</td>
                  <td>{qty}</td>
                  <td>{formatINR(rate)}</td>
                  <td>{formatINR(taxAmt)}</td>
                  {isIGST
                    ? <td>{formatINR(iIgst)}</td>
                    : <><td>{formatINR(iCgst)}</td><td>{formatINR(iSgst)}</td></>
                  }
                  <td>{formatINR(iTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals + Notes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 24, marginTop: 16, alignItems: 'start' }}>
          <div>
            {inv.notes && (
              <div style={{ fontSize: 11, color: 'rgba(26,22,18,.75)', lineHeight: 1.7, padding: '10px 12px', background: '#f7f5f2', border: '1px solid rgba(26,22,18,.1)', borderRadius: 4 }}>
                <span style={{ fontWeight: 700, color: '#1a1612' }}>Notes: </span>{inv.notes}
              </div>
            )}
          </div>
          <div style={{ border: '1px solid rgba(26,22,18,.12)', borderRadius: 4, overflow: 'hidden' }}>
            <TRow label="Taxable Amount" value={formatINR(taxable)} />
            {isIGST
              ? <TRow label={`IGST @${IGST_RATE_LABEL}%`} value={formatINR(igst)} />
              : <><TRow label={`CGST @${CGST_RATE_LABEL}%`} value={formatINR(cgst)} /><TRow label={`SGST @${SGST_RATE_LABEL}%`} value={formatINR(sgst)} /></>
            }
            {roundOff !== 0 && <TRow label="Round Off" value={formatINR(roundOff)} />}
            <TRow label="Grand Total" value={formatINR(grandTotal)} bold />
          </div>
        </div>

        {/* Amount in Words */}
        <div style={{ marginTop: 10, padding: '9px 14px', background: '#f7f5f2', border: '1px solid rgba(26,22,18,.1)', borderRadius: 4, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, color: 'rgba(26,22,18,.45)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, flexShrink: 0 }}>Amount in Words:</span>
          <span style={{ fontSize: 11, color: '#1a1612', fontWeight: 600, lineHeight: 1.5 }}>{amountInWords(grandTotal)}</span>
        </div>

        {/* Payment + e-Invoice */}
        {(paymentQr || irn) && (
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: paymentQr && irn ? '1fr 1fr' : '1fr', gap: 12 }}>
            {paymentQr && (
              <div style={{ padding: '12px 14px', background: '#f7f5f2', borderRadius: 4, border: '1px solid rgba(26,22,18,.1)' }}>
                <div className="receipt-label" style={{ marginBottom: 10 }}>Pay via UPI · Cash · Cheque</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, alignItems: 'start' }}>
                  <img src={paymentQr} alt="UPI QR"
                    style={{ width: 96, height: 96, display: 'block', border: '3px solid #fff', background: '#fff', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,.12)' }} />
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, lineHeight: 1.5 }}>
                    <PayRow label="UPI ID" value={paymentUpiId ?? ''} wrap />
                    <PayRow label="Payee" value={paymentUpiName} />
                    <PayRow label="Amount" value={formatINR(grandTotal)} />
                    <PayRow label="Ref" value={inv.id} />
                    <div style={{ marginTop: 8, fontSize: 9, color: 'rgba(26,22,18,.45)', borderTop: '1px solid rgba(26,22,18,.1)', paddingTop: 6 }}>
                      Cash / Cheque accepted at billing counter
                    </div>
                  </div>
                </div>
              </div>
            )}
            {irn && (
              <div style={{ padding: '12px 14px', background: '#f7f5f2', borderRadius: 4, border: '1px solid rgba(26,22,18,.1)' }}>
                <div className="receipt-label" style={{ marginBottom: 10 }}>e-Invoice Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: eInvoiceQr ? '1fr auto' : '1fr', gap: 14, alignItems: 'start' }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, lineHeight: 1.5 }}>
                    <PayRow label="IRN" value={irn} wrap />
                    {ackNo && <PayRow label="ACK No" value={ackNo} />}
                    {ackDate && <PayRow label="ACK Date" value={ackDate} />}
                  </div>
                  {eInvoiceQr && (
                    <img src={eInvoiceQr} alt="e-Invoice QR"
                      style={{ width: 96, height: 96, display: 'block', border: '3px solid #fff', background: '#fff', borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,.12)' }} />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, marginTop: 28, paddingTop: 16, borderTop: '2px solid rgba(26,22,18,.12)', alignItems: 'end' }}>
          <div style={{ fontSize: 10, color: 'rgba(26,22,18,.45)', lineHeight: 1.9 }}>
            <div>This is a computer-generated invoice and does not require a physical signature.</div>
            <div>Subject to {co?.city ?? 'Krishnagiri'} jurisdiction.</div>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 5, fontSize: 10 }}>
      <span style={{ color: 'rgba(26,22,18,.5)' }}>{label}</span>
      <strong style={{ color: '#1a1612', textAlign: 'right' }}>{value}</strong>
    </div>
  );
}

function PayRow({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 8, color: 'rgba(26,22,18,.45)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 10, color: '#1a1612', fontWeight: 600, overflowWrap: wrap ? 'anywhere' : 'normal' }}>{value}</div>
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
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: bold ? '#ffffff' : '#1a1612', fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}
