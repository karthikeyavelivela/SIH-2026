interface IconProps {
  /** A Material Symbols Outlined glyph name, e.g. "home_repair_service" — https://fonts.google.com/icons */
  name: string;
  className?: string;
  size?: number;
  filled?: boolean;
}

// Wraps the Material Symbols Outlined webfont (loaded once in layout.tsx) —
// the actual icon system every Stitch screen's code.html uses. Prefer this
// over a hand-drawn SVG for any new v3-native screen so icons match the
// design 1:1 by glyph name, not by approximation.
export function Icon({ name, className = '', size = 20, filled = false }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined leading-none select-none ${className}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}` }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
