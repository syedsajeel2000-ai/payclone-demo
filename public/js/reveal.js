/* Scroll/entrance reveal system — IntersectionObserver-driven fade-ins.
 * Usage:
 *   - Add class="reveal" (+ optional "reveal-left" / "reveal-right" / "reveal-scale")
 *     to any element. Add style="--rd:0.1s" for a per-element delay.
 *   - Call initReveals(rootEl) after rendering a page; it wires all .reveal
 *     descendants (not yet visible) and reveals them as they scroll into view.
 *   - Everything is disabled under prefers-reduced-motion (elements show instantly).
 */
let observer = null;

function makeObserver() {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }
  );
  return observer;
}

export function initReveals(root) {
  const els = (root || document).querySelectorAll('.reveal:not(.revealed), .reveal-stagger:not(.revealed)');
  if (!els.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('revealed'));
    return;
  }
  const obs = makeObserver();
  els.forEach((el) => obs.observe(el));

  /* failsafe: never leave content invisible. If an element is still pending
     after 3s (e.g. it lives inside a display:none container that became
     visible without an intersection event), force-reveal it. */
  setTimeout(() => {
    els.forEach((el) => {
      if (!el.classList.contains('revealed')) el.classList.add('revealed');
    });
  }, 3000);
}
