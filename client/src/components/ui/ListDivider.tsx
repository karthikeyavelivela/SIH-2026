// Per DESIGN.md: "Remove all vertical dividers. Use only horizontal lines
// in the hairline token to separate items." No vertical rules anywhere.
export function ListDivider({ className = '' }: { className?: string }) {
  return <hr className={`border-0 border-t border-fy-muted/10 ${className}`} />;
}
