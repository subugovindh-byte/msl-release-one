import { useEffect, useMemo, useRef, useState } from 'react';
import { useProducts, useCustomers, useCreateInvoice, useCreateCustomer } from '@/hooks/useApi';
import { CGST_RATE_LABEL, IGST_RATE_LABEL, SGST_RATE_LABEL, calculateInvoice, INDIAN_STATES } from '@modernex/shared';
import { formatCurrency } from '@/utils/format';
import { useToastStore, useCartStore } from '@/store';
import type { CartProduct } from '@/store';
import type { ProductKind, Customer } from '@/types';

interface PosProduct {
  id: string;
  variety: string;
  kind: ProductKind;
  hsn: string;
  uom: string;
  rate_paise: number;
  unit_cost_paise?: number;
  stock: number;
  lot_id?: string;
  grade?: string;
  effective_photo_url?: string;
  photo_url?: string;
  dimensions?: {
    size_lw?: string;
    thickness_mm?: number;
    sqft?: number;
    cft?: number;
  };
}

interface InvoiceResult {
  id: string;
  customer_name: string;
  total_paise: number;
  irn?: string;
}

export function POSPage() {
  const {
    items: cart,
    customerId: selectedCustomerId,
    cartOpen,
    addItem,
    removeItem,
    adjustQuantity,
    setRate,
    setCustomerId,
    clearCart,
    toggleCart,
  } = useCartStore();

  const cartItemCount = cart.reduce((n, i) => n + i.quantity, 0);
  const cartLineCount = cart.length;

  const [searchQuery, setSearchQuery] = useState('');
  const [varietyFilter, setVarietyFilter] = useState<string>('');
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop camera stream helper
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  // Start camera + BarcodeDetector scan loop
  const startCameraScan = async () => {
    const BarcodeDetector = (window as any).BarcodeDetector;
    if (!BarcodeDetector) {
      notify('Camera scan not supported on this browser. Use the search box — hardware QR scanners work as keyboard input.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
      // attach stream after state update (video element renders)
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 50);

      const detector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] });
      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          if (results.length > 0) {
            const code = results[0].rawValue;
            stopCamera();
            // Try exact product ID match first, then search
            const match = products.find(p => p.id === code || p.lot_id === code);
            if (match) {
              addToCart(match);
              notify(`Added ${match.variety} (${match.id}) to cart`, 'success');
            } else {
              setSearchQuery(code);
              notify(`Scanned: ${code} — select from results`, 'success');
            }
            return;
          }
        } catch { /* frame not ready */ }
        if (streamRef.current) requestAnimationFrame(scan);
      };
      requestAnimationFrame(scan);
    } catch {
      notify('Camera access denied', 'error');
      stopCamera();
    }
  };

  // Keyboard-wedge: pressing Enter with a unique match auto-adds product
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const matches = products.filter(p =>
      p.id?.toLowerCase() === searchQuery.toLowerCase() ||
      p.lot_id?.toLowerCase() === searchQuery.toLowerCase()
    );
    if (matches.length === 1) {
      addToCart(matches[0]!);
      setSearchQuery('');
      notify(`Added ${matches[0]!.variety} (${matches[0]!.id}) to cart`, 'success');
    }
  };

  const { data: productsResponse, isLoading: loadingProducts } = useProducts({ active: 'true', minStock: 1 });
  const { data: customersResponse, isLoading: loadingCustomers } = useCustomers();
  const createInvoiceMutation = useCreateInvoice();
  const createCustomerMutation = useCreateCustomer();
  const { notify } = useToastStore();

  const [addingCustomer, setAddingCustomer] = useState(false);
  const BLANK_CUST = { name: '', gstin: '', state: 'Tamil Nadu', contact: '', credit_days: 30 };
  const [newCust, setNewCust] = useState(BLANK_CUST);

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newCust.name.trim()) { notify('Customer name is required', 'error'); return; }
    try {
      const created: any = await createCustomerMutation.mutateAsync({
        name: newCust.name.trim(),
        gstin: newCust.gstin.trim() || undefined,
        state: newCust.state,
        contact: newCust.contact.trim() || undefined,
        credit_days: Number(newCust.credit_days) || 0,
      } as any);
      const id = created?.customer?.id || created?.id;
      if (id) setCustomerId(id);
      setNewCust(BLANK_CUST);
      setAddingCustomer(false);
      notify(`Customer "${newCust.name}" added`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to add customer', 'error');
    }
  }

  const products: PosProduct[] = (productsResponse?.products || []) as unknown as PosProduct[];
  const customers: Customer[] = (customersResponse?.customers || []) as Customer[];

  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setCustomerId(customers[0]!.id);
    }
  }, [customers, selectedCustomerId, setCustomerId]);

  const getRatePaise = (product: PosProduct | CartProduct) => product.rate_paise ?? product.unit_cost_paise ?? 0;
  const getDisplayPhoto = (product: PosProduct) => product.effective_photo_url || product.photo_url;
  const getDisplaySize = (product: PosProduct | CartProduct) => product.dimensions?.size_lw || 'N/A';
  const getDisplayThickness = (product: PosProduct | CartProduct) => product.dimensions?.thickness_mm;
  const getDisplaySqft = (product: PosProduct | CartProduct) => product.dimensions?.sqft;
  const getCartRatePaise = (item: { product: CartProduct; ratePaise: number }) => item.ratePaise ?? getRatePaise(item.product);
  const getUomQty = (product: PosProduct | CartProduct) => {
    if (product.kind === 'slab' || product.kind === 'cts') {
      return Number(product.dimensions?.sqft || 1);
    }
    if (product.kind === 'block') {
      return Number(product.dimensions?.cft || 1);
    }
    return 1;
  };

  // Filter products by variety
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = !searchQuery
        || product.variety?.toLowerCase().includes(searchQuery.toLowerCase())
        || product.id?.toLowerCase().includes(searchQuery.toLowerCase())
        || product.lot_id?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesVariety = !varietyFilter || product.variety === varietyFilter;
      return matchesSearch && matchesVariety;
    });
  }, [products, searchQuery, varietyFilter]);

  // Get unique varieties for filter
  const varieties = useMemo(() => {
    const unique = new Set(products.map(p => p.variety));
    return Array.from(unique).sort();
  }, [products]);

  const addToCart = (product: PosProduct) => {
    const result = addItem(product as CartProduct);
    if (result === 'max_stock') {
      notify('No more stock available', 'error');
    } else if (!cartOpen) {
      toggleCart();
    }
  };

  const decrementCartItem = (productId: string) => {
    const existing = cart.find((item) => item.product.id === productId);
    if (!existing) return;
    if (existing.quantity <= 1) {
      removeItem(productId);
      return;
    }
    adjustQuantity(productId, -1);
  };

  const handleRateUpdate = (productId: string, rateRupees: number) => {
    if (!Number.isFinite(rateRupees) || rateRupees < 0) {
      notify('Rate must be a non-negative number', 'error');
      return;
    }
    setRate(productId, rateRupees);
  };

  // Calculate totals
  const { subtotal, cgst, sgst, igst, grandTotal } = useMemo(() => {
    const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
    const invoiceCalc = calculateInvoice(
      cart.map((item) => ({
        product_id: item.product.id,
        hsn: item.product.hsn,
        uom: item.product.uom,
        uom_qty: getUomQty(item.product),
        qty: item.quantity,
        rate_paise: getCartRatePaise(item),
      })),
      selectedCustomer?.state,
      0
    );
    return {
      subtotal: invoiceCalc.taxable,
      cgst: invoiceCalc.cgst,
      sgst: invoiceCalc.sgst,
      igst: invoiceCalc.igst,
      grandTotal: invoiceCalc.grandTotal,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, selectedCustomerId, customers]);

  // Create invoice
  const handleCreateInvoice = async () => {
    if (cart.length === 0) {
      notify('Cart is empty', 'error');
      return;
    }
    if (!selectedCustomerId) {
      notify('Please select a customer', 'error');
      return;
    }

    const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
    if (!selectedCustomer) {
      notify(loadingCustomers ? 'Customers still loading — try again' : 'Selected customer not found — choose another', 'error');
      return;
    }

    const items = cart.map((item) => ({
      product_id: item.product.id,
      product_kind: item.product.kind,
      variety: item.product.variety,
      hsn: item.product.hsn,
      uom: item.product.uom,
      uom_qty: getUomQty(item.product),
      qty: item.quantity,
      rate_paise: getCartRatePaise(item),
      dimension_snapshot: item.product.dimensions || {},
      grade: item.product.grade,
    }));

    try {
      const invoice = await createInvoiceMutation.mutateAsync({
        customer_id: selectedCustomer.id,
        items: items as any,
        discount_pct: 0,
        notes: `POS sale for ${selectedCustomer.name}`,
      } as any);

      setInvoiceData(invoice as any);
      setShowInvoice(true);
      clearCart();
      notify('Invoice created successfully', 'success');
    } catch (error: any) {
      notify(error?.message || 'Failed to create invoice', 'error');
      console.error(error);
    }
  };

  if (loadingProducts || loadingCustomers) {
    return (
      <div className="page">
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--t3)' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="pos-wrap">
      {/* Product Grid */}
      <div className="pos-cat">
        {/* Camera QR scan modal */}
        {scanning && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#111', borderRadius: 12, padding: 20, width: 320, textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: 13, marginBottom: 10, fontWeight: 600 }}>Point camera at QR code</div>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 8, display: 'block' }} />
              <button onClick={stopCamera} style={{ marginTop: 14, padding: '8px 24px', background: 'var(--rust)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
            </div>
          </div>
        )}

        <div className="sbar">
          <input
            type="text"
            className="si"
            placeholder="Search or scan product ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            title="Type product ID and press Enter to add to cart, or use a barcode scanner"
          />
          <button
            onClick={startCameraScan}
            title="Scan QR code with camera"
            style={{ padding: '0 12px', height: 38, background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 6, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >📷</button>
          <select
            className="sf"
            value={varietyFilter}
            onChange={(e) => setVarietyFilter(e.target.value)}
          >
            <option value="">All Varieties</option>
            {varieties.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        {filteredProducts.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t3)' }}>
            No products available
          </div>
        ) : (
          <div className="slab-grid">
            {filteredProducts.map((product) => {
              const cartItem = cart.find((item) => item.product.id === product.id);
              const inCart = Boolean(cartItem);
              const lineTotal = cartItem
                ? getCartRatePaise(cartItem) * getUomQty(cartItem.product) * cartItem.quantity
                : getRatePaise(product) * getUomQty(product);
              
              return (
                <div
                  key={product.id}
                  className={`slab ${inCart ? 'ink' : ''}${product.stock <= 2 ? ' low' : ''}`}
                  onClick={() => addToCart(product)}
                >
                  {getDisplayPhoto(product) && (
                    <img src={getDisplayPhoto(product)} alt={product.variety} className="sl-photo" />
                  )}
                  <div className="sl-var">{product.variety}</div>
                  <div className="sl-lot">{product.id}</div>
                  {getDisplaySize(product) !== 'N/A' && (
                    <div className="sl-dims">
                      {getDisplaySize(product)}{getDisplayThickness(product) ? ` × ${getDisplayThickness(product)}mm` : ''}
                    </div>
                  )}
                  <div className="sl-bot">
                    <div>
                      <div className="sl-price">
                        {formatCurrency(getRatePaise(product))}
                      </div>
                      {getDisplaySqft(product) && (
                        <div className="sl-sqft">{Number(getDisplaySqft(product)).toFixed(2)} sqft</div>
                      )}
                      <div className="sl-stk">Stock {product.stock} {product.uom}</div>
                    </div>
                    {product.grade && (
                      <div className="bdg b-g">{product.grade}</div>
                    )}
                  </div>
                  <div className="sl-actions" onClick={(event) => event.stopPropagation()}>
                    {cartItem ? (
                      <>
                        <div className="sl-stepper">
                          <button
                            type="button"
                            className="sl-stepbtn"
                            onClick={() => decrementCartItem(product.id)}
                            aria-label={`Decrease ${product.variety} quantity`}
                          >
                            -
                          </button>
                          <div className="sl-stepqty">{cartItem.quantity}</div>
                          <button
                            type="button"
                            className="sl-stepbtn"
                            onClick={() => addToCart(product)}
                            aria-label={`Increase ${product.variety} quantity`}
                          >
                            +
                          </button>
                        </div>
                        <div className="sl-inline-total">{formatCurrency(lineTotal)}</div>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="sl-add"
                        onClick={() => addToCart(product)}
                      >
                        Add to cart
                      </button>
                    )}
                  </div>
                  {inCart && <div className="sl-dot">✓</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className={`cart${cartOpen ? '' : ' cart-closed'}`}>
        {cartOpen ? (
          <>
            {/* Header */}
            <div className="cart-head">
              <div className="cart-ht">Cart</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {cartItemCount > 0 && (
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: 'var(--t3)' }}>
                    {cartLineCount} {cartLineCount === 1 ? 'item' : 'items'} · {cartItemCount} {cartItemCount === 1 ? 'unit' : 'units'}
                  </span>
                )}
                <button className="cart-tog" onClick={toggleCart} title="Collapse cart">›</button>
              </div>
            </div>

            {/* Customer */}
            <div className="cart-cust">
              {!addingCustomer ? (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <select
                    className="fsel"
                    value={selectedCustomerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    style={{ fontSize: '10px', flex: 1 }}
                  >
                    <option value="">— select customer —</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setAddingCustomer(true)}
                    title="Add new customer"
                    style={{
                      flexShrink: 0, padding: '3px 7px', fontSize: 11, fontWeight: 700,
                      background: 'var(--bg3)', border: '1px solid var(--bd)',
                      color: 'var(--rust)', borderRadius: 4, cursor: 'pointer', lineHeight: 1,
                    }}
                  >+</button>
                </div>
              ) : (
                <form onSubmit={handleAddCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '6px 0' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t2)', marginBottom: 2 }}>New Customer</div>
                  <input
                    className="fi"
                    placeholder="Name *"
                    value={newCust.name}
                    onChange={e => setNewCust(c => ({ ...c, name: e.target.value }))}
                    style={{ fontSize: 11 }}
                    autoFocus
                    required
                  />
                  <input
                    className="fi"
                    placeholder="GSTIN (optional)"
                    value={newCust.gstin}
                    onChange={e => setNewCust(c => ({ ...c, gstin: e.target.value }))}
                    style={{ fontSize: 11 }}
                  />
                  <select
                    className="fsel"
                    value={newCust.state}
                    onChange={e => setNewCust(c => ({ ...c, state: e.target.value }))}
                    style={{ fontSize: 11 }}
                  >
                    {INDIAN_STATES.map((s: string) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input
                    className="fi"
                    placeholder="Phone (optional)"
                    value={newCust.contact}
                    onChange={e => setNewCust(c => ({ ...c, contact: e.target.value }))}
                    style={{ fontSize: 11 }}
                  />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      className="fi"
                      type="number" min="0" max="180"
                      placeholder="Credit days"
                      value={newCust.credit_days}
                      onChange={e => setNewCust(c => ({ ...c, credit_days: +e.target.value }))}
                      style={{ fontSize: 11, flex: 1 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                    <button type="submit" disabled={createCustomerMutation.isPending}
                      style={{ flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 700,
                        background: 'var(--rust)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                      {createCustomerMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => { setAddingCustomer(false); setNewCust(BLANK_CUST); }}
                      style={{ padding: '5px 10px', fontSize: 11,
                        background: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Items */}
            <div className="cart-list">
              {cart.length === 0 ? (
                <div style={{ padding: '30px 12px', textAlign: 'center', color: 'var(--t3)', fontSize: '10px' }}>
                  Add products to cart to prepare an invoice
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.product.id} className="ci">
                    <div className="ci-top">
                      <div className="ci-nm">{item.product.variety}</div>
                      <button className="ci-rm" onClick={() => removeItem(item.product.id)}>×</button>
                    </div>
                    <div className="ci-dt">{item.product.id} • {getDisplaySize(item.product)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <label style={{ fontSize: '10px', color: 'var(--t3)', minWidth: '48px' }}>Rate</label>
                      <CartRateInput
                        ratePaise={getCartRatePaise(item)}
                        productId={item.product.id}
                        onCommit={handleRateUpdate}
                      />
                    </div>
                    <div className="ci-bot">
                      <div className="qty">
                        <button className="qb" onClick={() => adjustQuantity(item.product.id, -1)}>−</button>
                        <div className="qn">{item.quantity}</div>
                        <button className="qb" onClick={() => adjustQuantity(item.product.id, 1)}>+</button>
                      </div>
                      <div className="ci-tot">
                        {formatCurrency(getCartRatePaise(item) * getUomQty(item.product) * item.quantity)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals */}
            <div className="cart-tots">
              <div className="tot-row">
                <div className="tot-lbl">Subtotal</div>
                <div className="tot-val">{formatCurrency(subtotal)}</div>
              </div>
              {cgst > 0 && (
                <div className="tot-row">
                  <div className="tot-lbl">CGST ({CGST_RATE_LABEL}%)</div>
                  <div className="tot-val">{formatCurrency(cgst)}</div>
                </div>
              )}
              {sgst > 0 && (
                <div className="tot-row">
                  <div className="tot-lbl">SGST ({SGST_RATE_LABEL}%)</div>
                  <div className="tot-val">{formatCurrency(sgst)}</div>
                </div>
              )}
              {igst > 0 && (
                <div className="tot-row">
                  <div className="tot-lbl">IGST ({IGST_RATE_LABEL}%)</div>
                  <div className="tot-val">{formatCurrency(igst)}</div>
                </div>
              )}
              <div className="tot-grand">
                <div className="tg-lbl">Grand Total</div>
                <div className="tg-val">{formatCurrency(grandTotal)}</div>
              </div>
            </div>

            {/* Checkout */}
            <div className="cart-acts">
              <button
                className="btn btn-s"
                onClick={clearCart}
                disabled={cart.length === 0 || createInvoiceMutation.isPending}
              >
                Clear
              </button>
              <button
                className="btn btn-p"
                style={{ flex: 1, opacity: (cart.length === 0 || !selectedCustomerId) && !createInvoiceMutation.isPending ? 0.55 : 1 }}
                onClick={handleCreateInvoice}
                disabled={createInvoiceMutation.isPending}
              >
                {createInvoiceMutation.isPending ? 'Creating...' : 'Invoice'}
              </button>
            </div>
          </>
        ) : (
          /* Collapsed dock strip */
          <button className="cart-dock" onClick={toggleCart} title="Open cart">
            <span className="cart-dock-arrow">‹</span>
            {cartItemCount > 0 && (
              <span className="cart-dock-count">{cartItemCount}</span>
            )}
            {grandTotal > 0 && (
              <span className="cart-dock-total">{formatCurrency(grandTotal)}</span>
            )}
          </button>
        )}
      </div>

      {/* Invoice success overlay */}
      {showInvoice && invoiceData && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--bd)',
              borderRadius: 10,
              padding: '28px 24px',
              width: 340,
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Check mark */}
            <div style={{ textAlign: 'center', fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--t1)', marginBottom: 16, letterSpacing: 0.5 }}>
              Invoice Created
            </div>

            {/* Summary */}
            <div style={{ background: 'var(--bg3)', borderRadius: 6, padding: '10px 14px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginBottom: 4 }}>
                <span>Invoice #</span><span style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--t1)', fontWeight: 600 }}>{invoiceData.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginBottom: 4 }}>
                <span>Customer</span><span style={{ color: 'var(--t2)', fontWeight: 600 }}>{invoiceData.customer_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--t1)', fontWeight: 700, borderTop: '1px solid var(--bd)', paddingTop: 8, marginTop: 6 }}>
                <span>Total</span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{formatCurrency(invoiceData.total_paise)}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                style={{ padding: '10px', background: 'var(--t1)', color: 'var(--bg1)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                onClick={() => window.open(`/invoice/${encodeURIComponent(invoiceData.id)}`, '_blank')}
              >
                ⎙ View & Print Receipt
              </button>
              <button
                style={{ padding: '10px', background: 'var(--bg3)', color: 'var(--t1)', border: '1px solid var(--bd)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                onClick={() => { setShowInvoice(false); setInvoiceData(null); }}
              >
                + New Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CartRateInput({
  ratePaise,
  productId,
  onCommit,
}: {
  ratePaise: number;
  productId: string;
  onCommit: (id: string, rateRupees: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft((ratePaise / 100).toFixed(2));
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const commit = () => {
    const val = parseFloat(draft);
    if (Number.isFinite(val) && val >= 0) {
      onCommit(productId, val);
    }
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="0"
        step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        style={{
          flex: 1,
          width: '100%',
          minWidth: 0,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '11px',
          fontWeight: 600,
          border: '1px solid var(--t2)',
          borderRadius: '4px',
          background: 'var(--bg1)',
          color: 'var(--t1)',
          padding: '4px 6px',
          outline: 'none',
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      title="Click to edit rate"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--t1)',
        background: 'var(--bg1)',
        border: '1px dashed var(--bd)',
        borderRadius: '4px',
        padding: '4px 6px',
        cursor: 'text',
        textAlign: 'left',
      }}
    >
      <span>₹{(ratePaise / 100).toFixed(2)}</span>
      <span style={{ fontSize: '8px', color: 'var(--t3)', marginLeft: 4 }}>✎</span>
    </button>
  );
}
