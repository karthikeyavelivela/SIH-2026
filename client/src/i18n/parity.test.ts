import { describe, it, expect } from 'vitest';
import en from './messages/en.json';
import te from './messages/te.json';
import hi from './messages/hi.json';

/*
 * Every user-facing string exists in all three languages, and Telugu and
 * Hindi are real translations — not English pasted into the other files.
 */

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const EN = flatten(en as Tree);
const TE = flatten(te as Tree);
const HI = flatten(hi as Tree);

// Values that are legitimately identical across languages: brand names,
// e-mail addresses, codes, formats. Anything else identical is a bug.
function languageNeutral(value: string): boolean {
  return (
    !/[A-Za-z]{3,}/.test(value) ||
    /^[^\s@]+@[^\s@]+$/.test(value) ||
    /^[A-Z0-9 _./:-]+$/.test(value) ||
    /^(FYRO|UPI|IFSC|GSTIN|PAN|SMS|OTP|KYC|CSV|PDF|TARA)\b/.test(value) ||
    /^\{\w+\}/.test(value) ||
    /^[a-z0-9@._-]+$/.test(value)
  );
}

describe('translation parity', () => {
  it('has exactly the same keys in en, te and hi', () => {
    const missingTe = [...EN.keys()].filter((k) => !TE.has(k));
    const missingHi = [...EN.keys()].filter((k) => !HI.has(k));
    const extraTe = [...TE.keys()].filter((k) => !EN.has(k));
    const extraHi = [...HI.keys()].filter((k) => !EN.has(k));
    expect({ missingTe, missingHi, extraTe, extraHi }).toEqual({ missingTe: [], missingHi: [], extraTe: [], extraHi: [] });
  });

  // ICU arguments used by a message: `{name}` and `{name, plural, ...}`.
  // Plural/select branch bodies (`one {# worker}`, `=0 {None}`) are not
  // arguments and are stripped first.
  function args(message: string): Set<string> {
    let s = message;
    for (let i = 0; i < 5; i += 1) {
      s = s.replace(/(=\d+|zero|one|two|few|many|other)\s*\{[^{}]*\}/g, '');
    }
    return new Set([...s.matchAll(/\{\s*(\w+)\s*(?:\}|,)/g)].map((m) => m[1]));
  }

  it('keeps every argument of the English string, and invents none', () => {
    const bad: string[] = [];
    for (const [k, v] of EN) {
      const want = args(v);
      // `{plural}`, `{unitPlural}` and the like are English-only "s"
      // suffixes; languages that inflect differently legitimately drop them.
      const suffix = (a: string) => a === 'plural' || a.endsWith('Plural');
      for (const a of [...want]) if (suffix(a)) want.delete(a);
      for (const [lang, map] of [['te', TE], ['hi', HI]] as const) {
        const have = args(map.get(k) ?? '');
        for (const a of [...have]) if (suffix(a)) have.delete(a);
        const missing = [...want].filter((a) => !have.has(a));
        const invented = [...have].filter((a) => !args(v).has(a));
        if (missing.length || invented.length) bad.push(`${lang}:${k} missing=${missing} invented=${invented}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('does not copy English into Telugu or Hindi', () => {
    const copied: string[] = [];
    for (const [k, v] of EN) {
      if (languageNeutral(v)) continue;
      if (TE.get(k) === v) copied.push(`te:${k}`);
      if (HI.get(k) === v) copied.push(`hi:${k}`);
    }
    expect(copied).toEqual([]);
  });
});
