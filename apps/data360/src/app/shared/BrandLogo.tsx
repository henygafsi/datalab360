/**
 * BrandLogo — the REAL DataLab360 mark, inlined from the primary logo SVG
 * (logo-primary.svg: the DATA wordmark in the brand electric blue, the
 * terracotta swoosh, and the « 360 » set in Barlow Bold).
 *
 * Inlined rather than <img>-referenced so (1) the « 360 » text renders in the
 * page's Barlow (an external SVG inside <img> cannot load fonts), and (2) the
 * blue can lighten in dark mode (pure #0000FC drowns on a dark ground).
 */

export default function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 478.94 173"
      role="img"
      aria-label="DataLab360"
      className={className}
    >
      <g className="fill-accent-600 dark:fill-accent-400">
        <path
          d="M286.1,354q-9.87,8.18-23.66,8.18H193V245.72h69.48A28.4,28.4,0,0,1,273.59,248a37.51,37.51,0,0,1,14.12,8.83l.32.32a36.67,36.67,0,0,1,6.58,11.79,29,29,0,0,1,2.24,11.16v47.65Q296.85,343.92,286.1,354Zm-72.85-87.13V341h50a12.22,12.22,0,0,0,9-3.69,15,15,0,0,0,3.53-9.63V280.06a15.24,15.24,0,0,0-3.53-9.63,12.34,12.34,0,0,0-9-3.61Z"
          transform="translate(-192.96 -213.01)"
        />
        <path
          d="M410.06,362.13H387.51l-35.38-83.68-34.58,83.68H295.41l49.1-116.41h15.16Z"
          transform="translate(-192.96 -213.01)"
        />
        <path
          d="M441.59,362.13h-21.1V266.82H384.55v-21.1h92.18v21.1H441.59Z"
          transform="translate(-192.96 -213.01)"
        />
        <path
          d="M600.23,330.59H577.46l-35.73-84.52L481.29,382.25H458.93L534,213h15.31Z"
          transform="translate(-192.96 -213.01)"
        />
      </g>
      <polygon
        className="fill-brand-500 dark:fill-brand-400"
        points="461.36 169.26 300.65 169.26 314.72 131.73 478.94 131.73 461.36 169.26"
      />
      <text
        className="fill-accent-600 dark:fill-accent-400"
        transform="translate(340.26 164.54)"
        style={{ fontSize: '37.61px', fontFamily: "Barlow, system-ui, sans-serif", fontWeight: 700 }}
      >
        360
      </text>
    </svg>
  );
}
