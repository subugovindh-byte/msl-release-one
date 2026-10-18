import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { FOOTER_GROUPS, SiteFooter } from './SiteFooter';

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe('Modernex site footer', () => {
  it('uses existing application routes rather than eModernex subdomains', () => {
    render(<MemoryRouter><SiteFooter companyName="Modernex Stones LLP" /></MemoryRouter>);
    expect(screen.getByRole('contentinfo', { name: 'Modernex footer' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Modernex applications' })).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(10);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      FOOTER_GROUPS.flatMap(({ links: group }) => group.map(({ to }) => to)),
    );
    expect(screen.getByText(new RegExp(`${new Date().getFullYear()} Modernex Stones LLP`))).toBeInTheDocument();
  });

  it('navigates internally and returns the actual page scroller to the top', () => {
    const scrollTo = vi.fn();
    const { container } = render(
      <MemoryRouter initialEntries={['/reports']}>
        <div data-site-scroll><SiteFooter /></div><Location />
      </MemoryRouter>,
    );
    const scroller = container.querySelector<HTMLElement>('[data-site-scroll]')!;
    scroller.scrollTo = scrollTo;
    fireEvent.click(screen.getByRole('link', { name: /^Inventory$/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('provides a keyboard-accessible back-to-top control', () => {
    const scrollTo = vi.fn();
    const { container } = render(<MemoryRouter><div data-site-scroll><SiteFooter /></div></MemoryRouter>);
    container.querySelector<HTMLElement>('[data-site-scroll]')!.scrollTo = scrollTo;
    fireEvent.click(screen.getByRole('button', { name: 'Back to top' }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});
