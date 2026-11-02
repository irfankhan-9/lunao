/**
 * Reliable auto-scroll to the very top utility.
 * Guarantees that upon view changes, section switches, or authenticating
 * from the landing code screen into the dashboard, all window, document,
 * and nested container scroll offsets are immediately and reliably reset to (0, 0).
 */

export function scrollToTop(smooth: boolean = false): void {
  if (typeof window === 'undefined') return;

  const behavior: ScrollBehavior = smooth ? 'smooth' : 'instant';

  // 1. Immediately reset standard browser window & document scrolling
  try {
    window.scrollTo({ top: 0, left: 0, behavior });
  } catch {
    window.scrollTo(0, 0);
  }

  if (document.documentElement) {
    document.documentElement.scrollTop = 0;
  }
  if (document.body) {
    document.body.scrollTop = 0;
  }

  // 2. Query and reset any main element or overflow containers
  const scrollTargets = document.querySelectorAll<HTMLElement>(
    'main, #main-content, #app-viewport, [data-scroll-container], .overflow-y-auto, .overflow-y-scroll'
  );

  scrollTargets.forEach((el) => {
    try {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    } catch {
      // ignore
    }
  });

  // 3. Coordinate with next animation frames to defeat layout recalculation shifts
  requestAnimationFrame(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior });
    } catch {
      window.scrollTo(0, 0);
    }
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    scrollTargets.forEach((el) => {
      try {
        el.scrollTop = 0;
      } catch {
        // ignore
      }
    });

    // 4. Secondary fallback ticks for async-loaded images and dynamic content
    setTimeout(() => {
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }, 40);

    setTimeout(() => {
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }, 120);
  });
}
