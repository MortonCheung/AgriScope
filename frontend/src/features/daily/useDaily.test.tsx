// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adaptDailySnapshot } from '../../domain/daily/adapter';
import type { DailyProvider, DailySnapshot } from '../../domain/daily/types';
import { useDaily } from './useDaily';
import { DAILY_TEST_NOW, dailyTestRaw } from './daily.testData';

afterEach(cleanup);

describe('Daily context service hook', () => {
  it('uses an injected provider and exposes a ready published snapshot', async () => {
    const data = adaptDailySnapshot(dailyTestRaw(), DAILY_TEST_NOW);
    const provider: DailyProvider = { latest: vi.fn().mockResolvedValue(data) };
    const { result } = renderHook(() => useDaily('shenyang', provider));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', data }));
    expect(provider.latest).toHaveBeenCalledWith('shenyang', { signal: expect.any(AbortSignal) });
  });

  it('does not fetch or carry market facts into unsupported cities', async () => {
    const provider: DailyProvider = { latest: vi.fn().mockResolvedValue(adaptDailySnapshot(dailyTestRaw(), DAILY_TEST_NOW)) };
    const { result, rerender } = renderHook(({ cityId }) => useDaily(cityId, provider), { initialProps: { cityId: 'shenyang' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ cityId: 'chaoyang' });
    expect(result.current.status).toBe('unsupported');
    expect(provider.latest).toHaveBeenCalledTimes(1);
  });

  it('exposes API failures and does not change them into ready fixture results', async () => {
    const provider: DailyProvider = { latest: vi.fn().mockRejectedValue(new Error('API unavailable')) };
    const { result } = renderHook(() => useDaily('shenyang', provider));
    await waitFor(() => expect(result.current).toEqual({ status: 'error', error: 'API unavailable' }));
  });

  it('cancels obsolete requests and ignores a late response after a city change', async () => {
    let resolve!: (data: DailySnapshot) => void;
    let signal: AbortSignal | undefined;
    const provider: DailyProvider = { latest: vi.fn((_city, options) => { signal = options?.signal; return new Promise<DailySnapshot>(done => { resolve = done; }); }) };
    const { result, rerender } = renderHook(({ cityId }) => useDaily(cityId, provider), { initialProps: { cityId: 'shenyang' } });
    rerender({ cityId: 'chaoyang' });
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(adaptDailySnapshot(dailyTestRaw(), DAILY_TEST_NOW)));
    expect(result.current.status).toBe('unsupported');
  });
});
