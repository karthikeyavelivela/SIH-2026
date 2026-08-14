type Tone = 'primary' | 'secondary' | 'muted';

const toneClasses: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  muted: 'bg-text-muted/10 text-text-muted',
};

export function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
