// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCachedResource } from './useCachedResource';

describe('research resource identity', () => {
  it('isolates a late response from the previous city', async () => {
    let finishA!: (value: string) => void;
    let finishB!: (value: string) => void;
    const pendingA = new Promise<string>(resolve => { finishA = resolve; });
    const pendingB = new Promise<string>(resolve => { finishB = resolve; });
    const { result, rerender } = renderHook(({ city }) => useCachedResource({
      key: city, peek: () => null, load: () => city === 'A' ? pendingA : pendingB, missingMessage: 'missing',
    }), { initialProps: { city: 'A' } });
    rerender({ city: 'B' });
    await act(async () => { finishB('B research'); });
    expect(result.current).toEqual({ status: 'ready', data: 'B research' });
    await act(async () => { finishA('A research'); });
    expect(result.current).toEqual({ status: 'ready', data: 'B research' });
  });

  it('never renders the previous city while switching to a cached city', () => {
    const renders: unknown[] = [];
    const { rerender } = renderHook(({ city }) => {
      const state = useCachedResource({ key: city, peek: () => `${city} research`, load: async () => '', missingMessage: 'missing' });
      renders.push(state);
      return state;
    }, { initialProps: { city: 'A' } });
    renders.length = 0;
    rerender({ city: 'B' });
    expect(renders.length).toBeGreaterThan(0);
    expect(renders.every(value => JSON.stringify(value).includes('B research'))).toBe(true);
  });
});
