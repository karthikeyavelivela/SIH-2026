/** Hairline rule between list rows — the only separator the designs use. */
export function ListDivider({ className = '' }: { className?: string }) {
  return <hr className={`border-0 border-t border-fy-hairline/60 ${className}`} />;
}
