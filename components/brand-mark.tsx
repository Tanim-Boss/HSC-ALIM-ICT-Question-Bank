/**
 * ICT Atlas brand mark — inlined React SVG (approved paths from
 * docs/design/brand-mark.svg).
 *
 * Inlined (rather than loaded via next/image from public/) so the strokes
 * keep `currentColor` and adapt to the active theme. An SVG served as an
 * <img> resource cannot inherit page CSS, so `currentColor` would resolve
 * to black in both themes and the mark would be nearly invisible in dark
 * mode. The favicon (app/icon.svg) remains a separate theme-aware asset.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-labelledby="ict-atlas-mark-title"
      className={className}
    >
      <title id="ict-atlas-mark-title">ICT Atlas mark</title>
      <path
        d="M4.75 20 12 4 19.25 20"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.5 13.25h7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="18.25" cy="5.75" r="1.75" fill="currentColor" />
    </svg>
  );
}
