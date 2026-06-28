// Big Ticket logo, recreated from the official mark: two interlocking circles
// (cyan gradient + purple) and the lowercase "big ticket." wordmark.
export function Logo({ height = 30 }: { height?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height }}>
      <svg height={height} viewBox="0 0 320 96" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Big Ticket">
        <defs>
          <linearGradient id="bt-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4ad6f0" />
            <stop offset="1" stopColor="#7b6cf0" />
          </linearGradient>
        </defs>
        {/* left circle: cyan gradient */}
        <circle cx="40" cy="48" r="40" fill="url(#bt-sky)" />
        {/* right circle: deep purple, overlapping */}
        <circle cx="96" cy="48" r="40" fill="#5e1eb9" fillOpacity="0.92" style={{ mixBlendMode: "multiply" }} />
        {/* wordmark */}
        <text x="150" y="64" fontFamily="Montserrat, sans-serif" fontWeight="800" fontSize="52" fill="#5e1eb9" letterSpacing="-1">
          big ticket<tspan fill="#4ad6f0">.</tspan>
        </text>
      </svg>
    </span>
  );
}
