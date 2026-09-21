'use client';

import { ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders its children at the end of <body>, outside every page's layout.
 *
 * WHY THIS HAD TO EXIST
 *
 * `position: fixed` is not absolute. An element with `transform`, `filter`,
 * `opacity` or a `z-index` on a positioned box creates a stacking context,
 * and a fixed child inside one is trapped in it — its own z-index is
 * compared only against its siblings, never against the page.
 *
 * Every booking screen wraps its form in `relative z-10`. The map pin
 * picker, which is `fixed inset-0 z-50`, was mounted inside that. So its
 * z-50 meant "on top of things inside this form", and the top bar and the
 * bottom tab bar — both z-40 at the root — painted straight over it. The
 * result on a real phone: the picker's own header and close button vanished
 * behind the page's header, and its confirm button sat under the tab bar.
 * It read as two separate bugs ("the pin does not work", "the nav is hiding
 * the button") and was one.
 *
 * A portal is the fix rather than a bigger z-index, because a bigger number
 * cannot escape a stacking context — there is no value of z-index that
 * would have worked.
 *
 * Mounted lazily so it is a no-op during server rendering, where there is
 * no document to portal into.
 */
export function Overlay({ children }: { children: ReactNode }) {
  /*
   * Resolved during the FIRST client render, not in an effect.
   *
   * An effect-gated portal renders nothing on the first pass, so a parent
   * that focuses something on open — Modal focuses its close button — runs
   * its own effect against a ref that is still null and silently gives up.
   * The keyboard user gets no focus and the focus-trap test goes red.
   *
   * `useState` with an initialiser is safe here because none of these
   * overlays is ever open during server rendering: they all return null
   * until a person opens them, which cannot happen before hydration.
   */
  const [container] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.body
  );
  if (!container) return null;
  return createPortal(children, container);
}
