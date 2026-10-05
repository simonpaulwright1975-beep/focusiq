/**
 * One-off clean-up of this browser's demo data. Bump DEMO_DATA_VERSION when the
 * demo's starting data changes, so people who opened an older demo don't keep
 * seeing its stored requests, adjustments or staff. Imported first by both apps.
 */
const DEMO_DATA_VERSION = '2026-10-05-stan-only';
const VERSION_KEY = 'focusiq-demo-version';

try {
  if (localStorage.getItem(VERSION_KEY) !== DEMO_DATA_VERSION) {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('focusiq-demo') || key.startsWith('focusiq-preview-session-')) localStorage.removeItem(key);
    }
    localStorage.setItem(VERSION_KEY, DEMO_DATA_VERSION);
  }
} catch {
  /* storage blocked: nothing stored to clean up */
}

export {};
