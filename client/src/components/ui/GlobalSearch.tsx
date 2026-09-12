'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Icon } from '@/components/ui/Icon';
import { EyebrowLabel, Body } from '@/components/fy/Text';

/**
 * Global search, opened with Ctrl/Cmd-K from anywhere.
 *
 * The client sends one thing — the query string — and renders whatever
 * groups come back. It does not choose collections, cannot request a scope
 * and has no notion of which role it is running as: that is all decided
 * server-side in search.service.ts. Group labels are looked up from the
 * returned KEY, so the whole surface is trilingual and a new group on the
 * server needs no change here beyond a translation.
 *
 * Recent searches are per-browser only (localStorage). They are the queries
 * the person typed, never the results — a result title can contain an
 * address or a name, and none of that belongs in a store that outlives the
 * session and is readable by anyone holding the device.
 */

interface Hit {
  id: string;
  title: string;
  subtitle?: string;
  path: string;
}

interface Group {
  key: string;
  hits: Hit[];
}

const RECENT_KEY = 'fyro.search.recent';
const RECENT_MAX = 5;
const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    // Private windows, cleared site data, and browsers configured to block
    // storage all land here. A missing convenience is not an error.
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* see readRecent */
  }
}

export function GlobalSearch() {
  const t = useTranslations('search');
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  // Guards against an earlier, slower response overwriting a later one.
  const seq = useRef(0);

  useEffect(() => {
    // Signed out, there is nothing to search and the endpoint would 401.
    if (!user) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    // The input is rendered in the same tick the overlay opens.
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (q.trim().length < MIN_CHARS) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    debounce.current = setTimeout(async () => {
      try {
        const res = await api.get<{ groups: Group[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`);
        if (mine === seq.current) {
          setGroups(res.groups);
          setCursor(0);
        }
      } catch {
        if (mine === seq.current) setGroups([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounce.current);
  }, [q]);

  const flat = groups.flatMap((g) => g.hits);

  const choose = useCallback(
    (hit: Hit) => {
      const next = [q.trim(), ...recent.filter((r) => r !== q.trim())].slice(0, RECENT_MAX);
      writeRecent(next);
      setOpen(false);
      setQ('');
      router.push(hit.path);
    },
    [q, recent, router]
  );

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && flat[cursor]) {
      e.preventDefault();
      choose(flat[cursor]);
    }
  }

  if (!user) return null;

  // The launcher. A keyboard shortcut nobody is told about is not a feature,
  // and most people on this app are on a phone that has no Ctrl key — so the
  // shortcut is the accelerator and this is the actual entry point. It sits
  // above the role nav rather than inside it: the nav's five destinations are
  // fixed per role and search is not a destination.
  if (!open) {
    return (
      <button
        type="button"
        aria-label={t('placeholder')}
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-24 z-40 w-12 h-12 rounded-full bg-fy-brown text-white shadow-lg flex items-center justify-center hover:bg-fy-brown/90 transition-colors"
      >
        <Icon name="search" size={22} />
      </button>
    );
  }

  let index = -1;

  return (
    <div
      className="fixed inset-0 z-[60] bg-fy-ink/40 backdrop-blur-[2px] flex items-start justify-center pt-[10vh] px-gutter"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="w-full max-w-xl bg-fy-bone rounded-card shadow-lg overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('placeholder')}
      >
        <div className="flex items-center gap-2 px-4 h-14 border-b border-fy-brown/12 shrink-0">
          <Icon name="search" size={18} className="text-fy-muted shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t('placeholder')}
            className="flex-1 bg-transparent outline-none font-body text-body text-fy-ink placeholder:text-fy-muted"
          />
          <button type="button" onClick={() => setOpen(false)} aria-label={t('close')} className="shrink-0 p-1">
            <Icon name="close" size={18} className="text-fy-muted" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {loading && (
            <p className="px-4 py-3 font-body text-label text-fy-muted">{t('searching')}</p>
          )}

          {!loading && q.trim().length >= MIN_CHARS && groups.length === 0 && (
            <p className="px-4 py-6 font-body text-label text-fy-muted">{t('noResults', { q: q.trim() })}</p>
          )}

          {q.trim().length < MIN_CHARS && recent.length > 0 && (
            <div className="py-2">
              <div className="px-4 flex items-center justify-between">
                <EyebrowLabel>{t('recent')}</EyebrowLabel>
                <button
                  type="button"
                  className="font-body text-label text-fy-muted hover:underline"
                  onClick={() => {
                    writeRecent([]);
                    setRecent([]);
                  }}
                >
                  {t('clearRecent')}
                </button>
              </div>
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setQ(r)}
                  className="w-full text-left px-4 py-2.5 hover:bg-fy-field flex items-center gap-2"
                >
                  <Icon name="history" size={16} className="text-fy-muted shrink-0" />
                  <Body size="label">{r}</Body>
                </button>
              ))}
            </div>
          )}

          {groups.map((group) => (
            <div key={group.key} className="py-2 border-t border-fy-brown/8 first:border-t-0">
              <EyebrowLabel className="px-4">{t(`groups.${group.key}` as never)}</EyebrowLabel>
              {group.hits.map((hit) => {
                index += 1;
                const active = index === cursor;
                return (
                  <button
                    key={`${group.key}:${hit.id}`}
                    type="button"
                    onClick={() => choose(hit)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 ${active ? 'bg-fy-field' : 'hover:bg-fy-field'}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-body text-body text-fy-ink truncate">{hit.title}</span>
                      {hit.subtitle && (
                        <span className="block font-body text-label text-fy-muted truncate">{hit.subtitle}</span>
                      )}
                    </span>
                    <Icon name="chevron_right" size={16} className="text-fy-muted shrink-0" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The visible affordance. A keyboard shortcut nobody is told about is not a
 *  feature — most people on this app are on a phone and will never press it. */
export function GlobalSearchButton({ className = '' }: { className?: string }) {
  const t = useTranslations('search');
  return (
    <button
      type="button"
      aria-label={t('placeholder')}
      onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
      className={`w-10 h-10 rounded-full flex items-center justify-center hover:bg-fy-field transition-colors ${className}`}
    >
      <Icon name="search" size={20} className="text-fy-ink" />
    </button>
  );
}
