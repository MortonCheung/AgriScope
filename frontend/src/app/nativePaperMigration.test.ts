// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserRouter } from 'react-router-dom';
import { waitFor } from '@testing-library/react';
import { APP_HISTORY_STORAGE_KEY } from './appHistory';
import { clearLegacyNativePaperTransitions, LEGACY_NATIVE_TRANSITIONS_KEY } from './nativePaperMigration';

afterEach(() => { sessionStorage.clear(); window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); });
describe('native paper migration before router initialization', () => {
  it('removes only the old Router native pairs, preserving app history and all inputs', () => {
    sessionStorage.setItem(LEGACY_NATIVE_TRANSITIONS_KEY, JSON.stringify({ '/liaoning': ['/reports'] }));
    sessionStorage.setItem(APP_HISTORY_STORAGE_KEY, 'observed-app-history');
    sessionStorage.setItem('agriscope:v4:planning:shenyang', 'user-conditions');
    clearLegacyNativePaperTransitions();
    clearLegacyNativePaperTransitions();
    expect(sessionStorage.getItem(LEGACY_NATIVE_TRANSITIONS_KEY)).toBeNull();
    expect(sessionStorage.getItem(APP_HISTORY_STORAGE_KEY)).toBe('observed-app-history');
    expect(sessionStorage.getItem('agriscope:v4:planning:shenyang')).toBe('user-conditions');
  });
  it('continues navigation when storage is unavailable', () => {
    const storage = { removeItem: vi.fn(() => { throw new DOMException('Blocked'); }) };
    expect(() => clearLegacyNativePaperTransitions(storage)).not.toThrow();
    expect(storage.removeItem).toHaveBeenCalledWith(LEGACY_NATIVE_TRANSITIONS_KEY);
  });
  it('prevents the real installed Router from restoring a native pair on POP', async () => {
    async function observePop(clear: boolean) {
      window.history.replaceState(null, '', '/liaoning');
      sessionStorage.setItem(LEGACY_NATIVE_TRANSITIONS_KEY, JSON.stringify({ '/liaoning': ['/reports'] }));
      if (clear) clearLegacyNativePaperTransitions();
      const router = createBrowserRouter([{ path: '/liaoning', element: null }, { path: '/reports', element: null }]);
      const updates: unknown[] = [];
      const unsubscribe = router.subscribe((_state, options) => updates.push(options.viewTransitionOpts));
      try {
        await router.navigate('/reports', { viewTransition: false });
        updates.length = 0;
        await router.navigate(-1);
        await waitFor(() => expect(router.state.location.pathname).toBe('/liaoning'));
        return updates.some(value => value !== undefined);
      } finally { unsubscribe(); router.dispose(); }
    }
    // Control proves the storage key is still the Router's actual key, not just a test fixture.
    expect(await observePop(false)).toBe(true);
    expect(await observePop(true)).toBe(false);
  });
});
