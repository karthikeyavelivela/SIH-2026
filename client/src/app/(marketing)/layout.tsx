import Link from 'next/link';

const navLinks = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-black/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="font-heading text-xl font-bold text-primary">
            FYRO
          </Link>
          <nav className="hidden md:flex gap-6 text-sm text-text-muted">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-text-primary transition">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex gap-3">
            <Link href="/login" className="text-sm font-medium px-4 py-2 rounded-full hover:bg-surface transition">
              Log in
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-black/5 py-10 mt-20">
        <div className="max-w-6xl mx-auto px-6 text-sm text-text-muted flex flex-wrap justify-between gap-4">
          <span>© 2026 FYRO. Andhra Pradesh.</span>
          <div className="flex gap-6">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-text-primary transition">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
