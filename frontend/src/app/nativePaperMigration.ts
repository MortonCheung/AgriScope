/** React Router 7.18 stores native POP pairs here, independently of app history.
 * Retiring native paper motion must happen before createBrowserRouter restores them.
 */
export const LEGACY_NATIVE_TRANSITIONS_KEY = 'remix-router-transitions';
export function clearLegacyNativePaperTransitions(storage?: Pick<Storage, 'removeItem'>): void {
  try { (storage ?? window.sessionStorage).removeItem(LEGACY_NATIVE_TRANSITIONS_KEY); }
  catch { /* Blocked storage must never prevent a route from opening. */ }
}
