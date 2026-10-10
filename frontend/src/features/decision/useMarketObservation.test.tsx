// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { MarketObservation } from '../../domain/market/types';
import { getMarketProvider } from '../../providers/market';
import { useMarketObservation } from './useMarketObservation';
vi.mock('../../providers/market', () => ({ getMarketProvider: vi.fn() }));
const empty = (cityId: string): MarketObservation => ({ cityId, cityName: cityId, unit: '元/kg', available: false, selectedCrop: null, snapshotVersion: null, crops: [], series: [] });
function Probe({ cityId, crop }: { cityId: string; crop?: string }) { const state = useMarketObservation(cityId, crop); return <output>{state.status}:{state.data?.cityId ?? ''}</output>; }
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('aborts an old city/crop request and never reveals its later response in the new city', async () => {
  const pending: { resolve: (data: MarketObservation) => void; signal: AbortSignal }[] = [];
  const observations = vi.fn((_city: string, _crop?: string, options?: { signal?: AbortSignal }) => new Promise<MarketObservation>(resolve => pending.push({ resolve, signal: options!.signal! })));
  vi.mocked(getMarketProvider).mockReturnValue({ observations });
  const rendered = render(<Probe cityId="shenyang" crop="黄瓜" />);
  rendered.rerender(<Probe cityId="chaoyang" crop="土豆" />);
  expect(pending[0].signal.aborted).toBe(true);
  await act(async () => { pending[0].resolve(empty('shenyang')); });
  expect(screen.getByText('loading:')).toBeTruthy();
  await act(async () => { pending[1].resolve(empty('chaoyang')); });
  await waitFor(() => expect(screen.getByText('ready:chaoyang')).toBeTruthy());
  expect(observations.mock.calls.map(args => args.slice(0, 2))).toEqual([['shenyang', '黄瓜'], ['chaoyang', '土豆']]);
});
