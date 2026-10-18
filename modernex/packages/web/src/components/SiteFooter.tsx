import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';

export const FOOTER_GROUPS = [
  { title: 'Operations', links: [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Inventory', to: '/inventory' },
    { label: 'Production', to: '/production' },
  ] },
  { title: 'Business', links: [
    { label: 'Point of sale', to: '/pos' },
    { label: 'Purchasing', to: '/purchase' },
    { label: 'Accounts & finance', to: '/accounts' },
    { label: 'Reports', to: '/reports' },
  ] },
  { title: 'People & access', links: [
    { label: 'People & payroll', to: '/payroll' },
    { label: 'My profile', to: '/profile' },
    { label: 'Help & handbook', to: '/help' },
  ] },
] as const;

export function SiteFooter({ companyName = 'Modernex Stones LLP' }: { companyName?: string }) {
  const scrollToTop = (event: MouseEvent<HTMLElement>, smooth = false) => {
    const scroller = event.currentTarget.closest<HTMLElement>('[data-site-scroll]');
    const behavior = smooth && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto';
    if (scroller) scroller.scrollTo({ top: 0, behavior });
    else window.scrollTo({ top: 0, behavior });
  };

  return (
    <footer className="site-footer" aria-label="Modernex footer">
      <div className="site-footer-inner">
        <div className="site-footer-main">
          <div className="site-footer-brand">
            <strong>Modernex</strong>
            <p>Connected operations.<br />One platform.</p>
            <span>From quarry to customer, keep your business connected.</span>
          </div>
          <nav className="site-footer-navigation" aria-label="Modernex applications">
            {FOOTER_GROUPS.map(({ title, links }) => (
              <div className="site-footer-group" key={title}>
                <h2>{title}</h2>
                <ul>{links.map(({ label, to }) => (
                  <li key={to}><Link to={to} onClick={scrollToTop}>{label}</Link></li>
                ))}</ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="site-footer-bottom">
          <p>© {new Date().getFullYear()} {companyName}. All rights reserved.</p>
          <p>Access follows your assigned roles.</p>
          <button type="button" className="site-footer-top" onClick={(event) => scrollToTop(event, true)}>
            Back to top <span aria-hidden="true">↑</span>
          </button>
        </div>
      </div>
    </footer>
  );
}
