export function MarketingLogo({ size = 27 }: Readonly<{ size?: number }>) {
  return (
    <span className="marketing-logo" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="6.25" cy="6.25" r="3.75" />
        <path d="m9.2 9.2 4.3 4.3" />
        <circle className="marketing-logo-dot" cx="6.25" cy="6.25" r="1.25" />
      </svg>
    </span>
  );
}
