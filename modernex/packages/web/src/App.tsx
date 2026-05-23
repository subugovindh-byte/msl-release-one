import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { useAuthStore, useThemeStore, useToastStore, useCartStore } from '@/store';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { POSPage } from '@/pages/POSPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { ProductTracePage } from '@/pages/ProductTracePage';
import { ProductionPage } from '@/pages/ProductionPage';
import { PurchasePage } from '@/pages/PurchasePage';
import { AccountsPage } from '@/pages/AccountsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { MastersPage } from '@/pages/MastersPage';
import { CollectionAccountsPage } from '@/pages/CollectionAccountsPage';
import { UsersPage } from '@/pages/UsersPage';
import { RolesPage } from '@/pages/RolesPage';
import { SystemPage } from '@/pages/SystemPage';
import { VarietyPhotosPage } from '@/pages/VarietyPhotosPage';
import { InvoiceReceiptPage } from '@/pages/InvoiceReceiptPage';
import { PurchaseOrderReceiptPage } from '@/pages/PurchaseOrderReceiptPage';
import { CompliancePage } from '@/pages/CompliancePage';
import { PayrollPage } from '@/pages/PayrollPage';
import { TdsPage } from '@/pages/TdsPage';
import { PdcPage } from '@/pages/PdcPage';
import { FixedAssetsPage } from '@/pages/FixedAssetsPage';
import { ChartOfAccountsPage } from '@/pages/ChartOfAccountsPage';
import { MsmeReportPage } from '@/pages/MsmeReportPage';
import { HelpPage } from '@/pages/HelpPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { ConsumablesPage } from '@/pages/ConsumablesPage';
import { ToastContainer } from '@/components/ToastContainer';
import { useCompany } from '@/hooks/useApi';

interface NavSection {
  sec?: string;
  id?: string;
  path?: string;
  lbl?: string;
  icon?: string;
}

const NAV: NavSection[] = [
  { sec: 'Operations' },
  { id: 'dashboard', path: '/dashboard', lbl: 'Dashboard', icon: '◈' },
  { id: 'pos', path: '/pos', lbl: 'POS', icon: '◉' },
  { id: 'inventory', path: '/inventory', lbl: 'Inventory', icon: '▦' },
  { id: 'production', path: '/production', lbl: 'Production', icon: '◈' },
  { sec: 'Finance' },
  { id: 'purchase', path: '/purchase', lbl: 'Purchase', icon: '▼' },
  { id: 'consumables', path: '/consumables', lbl: 'Consumables & Parts', icon: '⚙' },
  { id: 'accounts', path: '/accounts', lbl: 'Accounts', icon: '₹' },
  { id: 'coa', path: '/coa', lbl: 'Chart of Accounts', icon: '⊞' },
  { id: 'reports', path: '/reports', lbl: 'Reports', icon: '◢' },
  { id: 'compliance', path: '/compliance', lbl: 'Compliance', icon: '◳' },
  { sec: 'HR & Payroll' },
  { id: 'payroll', path: '/payroll', lbl: 'Payroll', icon: '◑' },
  { id: 'tds', path: '/tds', lbl: 'TDS', icon: '◧' },
  { id: 'pdc', path: '/pdc', lbl: 'PDC', icon: '◫' },
  { id: 'fixed-assets', path: '/fixed-assets', lbl: 'Fixed Assets', icon: '◰' },
  { id: 'msme', path: '/msme', lbl: 'MSME', icon: '◭' },
  { sec: 'Setup' },
  { id: 'masters', path: '/masters', lbl: 'Masters', icon: '◐' },
  { id: 'variety-photos', path: '/variety-photos', lbl: 'Variety Photos', icon: '◫' },
  { id: 'accounts-cfg', path: '/accounts-cfg', lbl: 'Bank/UPI', icon: '◎' },
  { id: 'users', path: '/users', lbl: 'Users', icon: '◔' },
  { id: 'roles', path: '/roles', lbl: 'Roles & Permissions', icon: '◈' },
  { id: 'system', path: '/system', lbl: 'System', icon: '◆' },
  { id: 'help', path: '/help', lbl: 'Help / Handbook', icon: '?' },
];

function formatDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function App() {
  const { user, loading, logout, checkAuth } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const { notify } = useToastStore();
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();
  const { data: companyData } = useCompany();
  const company = companyData?.company;
  const COMPANY = company?.name ?? 'MODERNEX STONES LLP';
  const GSTIN = company?.gstin ?? '33ACGFM7745J1ZW';
  const HSN = company?.hsn ?? '2516';

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--t3)',
          fontSize: 11,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
        <ToastContainer />
      </>
    );
  }

  const handleLogout = async () => {
    await logout();
    notify('Signed out', 'success');
    navigate('/login');
  };

  return (
    <>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="nav-toggle"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
          >
            <span></span><span></span><span></span>
          </button>
          <div>
            <div className="tb-brand">{COMPANY}</div>
            <div className="tb-sub">
              GST {GSTIN} · HSN {HSN} · FY 2025-26
            </div>
          </div>
        </div>
        <div className="tb-right">
          <span className="chip">{formatDate()}</span>
          <button
            className={`refresh-btn${isFetching ? ' spinning' : ''}`}
            onClick={() => queryClient.invalidateQueries()}
            aria-label="Refresh data"
            title="Refresh"
          >
            ↻
          </button>
          <button className="theme-btn" onClick={toggle} aria-label="Toggle theme">
            <span>{theme === 'dark' ? '☀' : '🌙'}</span>
            <span>{theme === 'dark' ? ' Day' : ' Night'}</span>
          </button>
        </div>
      </div>

      <div className={`nav-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      <div className="body-wrap">
        <div className={`sidebar${menuOpen ? ' open' : ''}`}>
          <NavLink
            to="/profile"
            className="sb-user"
            onClick={() => setMenuOpen(false)}
            style={{ textDecoration: 'none', cursor: 'pointer' }}
            title="My Profile & Settings"
          >
            <div className="sb-av">
              {user.fullName?.[0] || user.username[0]}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="sb-name">{user.fullName || user.username}</div>
              <div className="sb-role">{user.role} · Settings</div>
            </div>
          </NavLink>

          {NAV.map((item, i) =>
            item.sec ? (
              <div key={`sec-${i}`} className="sb-sec">
                {item.sec}
              </div>
            ) : (
              <NavLink
                key={item.id}
                to={item.path!}
                className={({ isActive }) =>
                  `sb-nav${isActive ? ' sb-nav-active' : ''}`
                }
                onClick={() => setMenuOpen(false)}
              >
                <span className="sb-icon">{item.icon}</span>
                <span>{item.lbl}</span>
                {item.id === 'pos' && cartCount > 0 && (
                  <span style={{
                    marginLeft: 'auto',
                    minWidth: 16, height: 16,
                    background: 'var(--t1)',
                    color: 'var(--bg1)',
                    borderRadius: 8,
                    fontSize: 9,
                    fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px',
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    {cartCount}
                  </span>
                )}
              </NavLink>
            )
          )}

          <button className="sb-logout" onClick={() => { setMenuOpen(false); handleLogout(); }}>
            <span className="sb-icon">◉</span>
            <span>Sign Out</span>
          </button>
        </div>

        <div className="main-content">
          <div className="main-scroll">
            <Routes>
              <Route path="/" element={<Navigate to="/pos" />} />
              <Route path="/login" element={<Navigate to="/pos" />} />
              <Route path="/pos" element={<POSPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/trace/product/:id" element={<ProductTracePage />} />
              <Route path="/production" element={<ProductionPage />} />
              <Route path="/purchase" element={<PurchasePage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/masters" element={<MastersPage />} />
              <Route path="/variety-photos" element={<VarietyPhotosPage />} />
              <Route path="/accounts-cfg" element={<CollectionAccountsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/roles" element={<RolesPage />} />
              <Route path="/system" element={<SystemPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/compliance" element={<CompliancePage />} />
              <Route path="/payroll" element={<PayrollPage />} />
              <Route path="/tds" element={<TdsPage />} />
              <Route path="/pdc" element={<PdcPage />} />
              <Route path="/fixed-assets" element={<FixedAssetsPage />} />
              <Route path="/coa" element={<ChartOfAccountsPage />} />
              <Route path="/msme" element={<MsmeReportPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/consumables" element={<ConsumablesPage />} />
              <Route path="/invoice/:id" element={<InvoiceReceiptPage />} />
              <Route path="/purchase/:id" element={<PurchaseOrderReceiptPage />} />
              <Route path="*" element={<Navigate to="/pos" />} />
            </Routes>
          </div>
          <footer className="app-footer">
            <div className="app-footer__brand">MODERNEX STONES LLP</div>
            <div className="app-footer__meta">Granite ERP · GST {GSTIN} · HSN {HSN}</div>
          </footer>
        </div>
      </div>

      <ToastContainer />
    </>
  );
}
