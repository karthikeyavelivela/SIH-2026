'use client';

import { useEffect } from 'react';

/**
 * Scroll-entrance for anything carrying `.fy-reveal`.
 *
 * One observer for the whole page rather than one per element, and each
 * element is unobserved the moment it has been seen — a marketing page has
 * dozens of these and none of them needs to animate twice.
 *
 * The CSS keeps `.fy-reveal` at its resting state under
 * prefers-reduced-motion, and this hook bails out entirely when
 * IntersectionObserver is missing, so content can never be left invisible
 * because the animation did not run.
 */
export function useReveal(deps: React.DependencyList = []) {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const nodes = Array.from(document.querySelectorAll('.fy-reveal:not(.is-in)'));
    if (nodes.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      },
      // Fire a little before the element reaches the fold, so the motion
      // has finished by the time it is properly in view.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
    );

    for (const node of nodes) io.observe(node);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
