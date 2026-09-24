/**
 * Solo workers come in three kinds, all on the same dispatch engine, each
 * with its own area of the app:
 *
 *   hamali  -> /hamali   loading and general labour
 *   skilled -> /skilled  household trades (electrician, plumber, ...)
 *   agri    -> /agri     farm labour
 *
 * The kind is set at signup and travels on the session (/api/auth/me).
 * Accounts from before kinds existed carry none and are loading workers.
 */
export type WorkerKind = 'hamali' | 'skilled' | 'agri';
export type WorkerBase = '/driver' | '/hamali' | '/skilled' | '/agri';

export function workerBaseFor(kind?: WorkerKind | null): '/hamali' | '/skilled' | '/agri' {
  if (kind === 'skilled') return '/skilled';
  if (kind === 'agri') return '/agri';
  return '/hamali';
}

/** The household trades a skilled worker can hold — the server's TRADE_SKILLS. */
export const TRADE_SKILLS = [
  'electrical',
  'plumbing',
  'carpentry',
  'painting',
  'technician',
  'cleaning',
  'domestic_help',
  'caregiving',
  'gardening',
] as const;

export const TRADE_GLYPH: Record<(typeof TRADE_SKILLS)[number], string> = {
  electrical: 'electrical_services',
  plumbing: 'plumbing',
  carpentry: 'carpenter',
  painting: 'format_paint',
  technician: 'build',
  cleaning: 'cleaning_services',
  domestic_help: 'home',
  caregiving: 'elderly',
  gardening: 'yard',
};
