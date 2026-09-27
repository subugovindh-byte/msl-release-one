import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
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
import BlockInspectionListPage from '@/pages/BlockInspectionListPage';
import BlockInspectionDetailPage from '@/pages/BlockInspectionDetailPage';
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
import { BankReconPage } from '@/pages/BankReconPage';
import { BudgetPage } from '@/pages/BudgetPage';
import { ToastContainer } from '@/components/ToastContainer';
import { useCompany } from '@/hooks/useApi';

interface NavSection {
  sec?: string;
  id?: string;
  path?: string;
  lbl?: string;
  icon?: string;
}

interface NavGroup {
  sec: string;
  items: NavSection[];
}

function buildGroups(nav: NavSection[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of nav) {
    if (item.sec) groups.push({ sec: item.sec, items: [] });
    else groups[groups.length - 1]?.items.push(item);
  }
  return groups;
}

const NAV: NavSection[] = [
  { sec: 'Daily Ops' },
  { id: 'dashboard',   path: '/dashboard',   lbl: 'Dashboard',           icon: '◈' },
  { id: 'pos',         path: '/pos',          lbl: 'POS',                 icon: '◉' },
  { id: 'inventory',   path: '/inventory',    lbl: 'Inventory',           icon: '▦' },

  { sec: 'Production' },
  { id: 'production',  path: '/production',   lbl: 'Production',          icon: '⚙' },
  { id: 'consumables', path: '/consumables',  lbl: 'Consumables & Parts', icon: '◫' },

  { sec: 'Purchase' },
  { id: 'purchase',    path: '/purchase',     lbl: 'Purchase Orders',     icon: '▼' },
  { id: 'inspections', path: '/inspections',  lbl: 'Block Inspections',   icon: '◎' },

  { sec: 'Finance' },
  { id: 'accounts',    path: '/accounts',     lbl: 'Accounts',            icon: '₹' },
  { id: 'coa',         path: '/coa',          lbl: 'Chart of Accounts',   icon: '⊞' },
  { id: 'bank-recon',  path: '/bank-recon',   lbl: 'Bank Reconciliation', icon: '⇌' },
  { id: 'budget',      path: '/budget',       lbl: 'Budget vs Actual',    icon: '◰' },
  { id: 'reports',     path: '/reports',      lbl: 'Reports',             icon: '◢' },

  { sec: 'Statutory' },
  { id: 'compliance',  path: '/compliance',   lbl: 'Compliance',          icon: '◳' },
  { id: 'tds',         path: '/tds',          lbl: 'TDS',                 icon: '◧' },
  { id: 'pdc',         path: '/pdc',          lbl: 'PDC',                 icon: '◎' },
  { id: 'msme',        path: '/msme',         lbl: 'MSME',                icon: '◭' },

  { sec: 'HR' },
  { id: 'payroll',      path: '/payroll',      lbl: 'Payroll',            icon: '◑' },
  { id: 'fixed-assets', path: '/fixed-assets', lbl: 'Fixed Assets',      icon: '◐' },

  { sec: 'System' },
  { id: 'masters',       path: '/masters',       lbl: 'Masters',              icon: '◆' },
  { id: 'variety-photos',path: '/variety-photos',lbl: 'Variety Photos',       icon: '◫' },
  { id: 'accounts-cfg',  path: '/accounts-cfg',  lbl: 'Bank / UPI Accounts',  icon: '⊞' },
  { id: 'users',         path: '/users',          lbl: 'Users',                icon: '◔' },
  { id: 'roles',         path: '/roles',          lbl: 'Roles & Permissions',  icon: '◈' },
  { id: 'system',        path: '/system',         lbl: 'System',               icon: '◆' },
  { id: 'help',          path: '/help',           lbl: 'Help / Handbook',      icon: '?' },
];

const NAV_GROUPS = buildGroups(NAV);

// Company names come out of the data upper-cased ("MODERNEX STONES LLP").
// Title-case them for the topbar, but leave legal/technical acronyms alone —
// a naive title-case would render "LLP" as "Llp".
const ACRONYMS = new Set(['LLP', 'LLC', 'PLC', 'GST', 'HSN', 'UPI', 'ERP', 'PVT']);

function titleCaseName(value: string): string {
  return value
    .split(/(\s+)/)
    .map(word => {
      if (!word.trim()) return word;
      const letters = word.replace(/[^A-Za-z]/g, '').toUpperCase();
      if (ACRONYMS.has(letters)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export function App() {
  const { user, loading, logout, checkAuth } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const { notify } = useToastStore();
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  // Which section is expanded. Only ever one: on desktop these are dropdown
  // menus in the top bar, on mobile they're accordions inside the drawer.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  const closeAll = () => {
    setOpenMenu(null);
    setMenuOpen(false);
  };

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

  // Dropdowns open on click, so they need an explicit way back out.
  useEffect(() => {
    if (!openMenu && !menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu, menuOpen]);

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
            <div className="tb-brand">{titleCaseName(COMPANY)}</div>
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
          <NavLink
            to="/profile"
            className="tb-user"
            onClick={closeAll}
            title="My Profile & Settings"
          >
            <span className="tb-av">{user.fullName?.[0] || user.username[0]}</span>
            <span className="tb-user-meta">
              <span className="tb-user-name">{user.fullName || user.username}</span>
              <span className="tb-user-role">{user.role}</span>
            </span>
          </NavLink>
          <button
            className="tb-logout"
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
          >
            ⎋
          </button>
        </div>
      </div>

      <div className={`nav-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      <nav className={`topnav${menuOpen ? ' open' : ''}`} ref={navRef} aria-label="Main">
        <div className="topnav-inner">
          {NAV_GROUPS.map(({ sec, items }) => {
            const isOpen = openMenu === sec;
            // Highlight the section owning the current route, so the active
            // page stays discoverable once its menu is closed.
            const hasActive = items.some(i => i.path === pathname);
            const groupCount = sec === 'Daily Ops' ? cartCount : 0;
            return (
              <div className={`tn-group${isOpen ? ' tn-group--open' : ''}`} key={sec}>
                <button
                  className={`tn-sec${hasActive ? ' tn-sec--active' : ''}`}
                  onClick={() => setOpenMenu(o => (o === sec ? null : sec))}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                >
                  <span>{sec}</span>
                  {groupCount > 0 && !isOpen && <span className="tn-badge">{groupCount}</span>}
                  <span className="tn-chevron" />
                </button>

                <div className="tn-menu" role="menu">
                  {items.map(item => (
                    <NavLink
                      key={item.id}
                      to={item.path!}
                      role="menuitem"
                      className={({ isActive }) => `tn-item${isActive ? ' tn-item--active' : ''}`}
                      onClick={closeAll}
                    >
                      <span className="tn-icon">{item.icon}</span>
                      <span className="tn-label">{item.lbl}</span>
                      {item.id === 'pos' && cartCount > 0 && (
                        <span className="tn-badge tn-badge--item">{cartCount}</span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="body-wrap">
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
              <Route path="/bank-recon" element={<BankReconPage />} />
              <Route path="/budget" element={<BudgetPage />} />
              <Route path="/invoice/:id" element={<InvoiceReceiptPage />} />
              <Route path="/purchase/:id" element={<PurchaseOrderReceiptPage />} />
              <Route path="/inspections" element={<BlockInspectionListPage />} />
              <Route path="/inspections/:id" element={<BlockInspectionDetailPage />} />
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
