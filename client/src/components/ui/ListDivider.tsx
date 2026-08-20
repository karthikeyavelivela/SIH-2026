// Per DESIGN.md: "Remove all vertical dividers. Use only horizontal lines
// in #6B6860 at 10% opacity to separate items." No vertical rules anywhere.
export function ListDivider({ className = '' }: { className?: string }) {
  return <hr className={`border-0 border-t border-ip-outline/10 ${className}`} />;
}
