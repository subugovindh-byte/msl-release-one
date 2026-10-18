/**
 * The Modernex Stones mark (docs/brand): a stone block cut into slabs leaning off the gang saw, the blade's cut running out
 * beneath them, the speckle of salt-and-pepper granite. Ghost style — line only, in the text colour — beside the wordmark.
 * Below 20 px the speckle is left out (it would only be noise).
 */
export function BrandMark({ size = 24, title = 'Modernex Stones' }: { size?: number; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role={title ? 'img' : 'presentation'} aria-label={title || undefined}
         aria-hidden={title ? undefined : true} style={{ display: 'block', flexShrink: 0 }}
         fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {title ? <title>{title}</title> : null}
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7.2 15.8L10.6 7.6M10.6 15.8L14 7.6M14 15.8L17.4 7.6" />
      <path d="M6.6 18.4H22.4" />
      {size >= 20 ? <>
        <path strokeWidth="1.5" d="M6.2 6.2h0M18.4 12.2h0" />
        <path strokeWidth="1.1" strokeOpacity=".45" d="M6.2 9.8h0M8.6 5.8h0M18.4 15.4h0M16.4 16h0M17.8 5.8h0" />
      </> : null}
    </svg>
  );
}
