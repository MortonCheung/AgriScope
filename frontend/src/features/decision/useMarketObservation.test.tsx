// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { MarketObservation } from '../../domain/market/types';
import { getMarketProvider } from '../../providers/market';
import { useMarketObservation } from './useMarketObservation';
vi.mock('../../providers/market', () => ({ getMarketProvider: vi.fn() }));
const empty = (cityId: string): MarketObservation => ({ cityId, cityName: cityId, unit: '元/kg', available: false, selectedCrop: null, snapshotVersion: null, crops: [], series: [] });
function Probe({ cityId, crop }: { cityId: string; crop?: string }) { const state = useMarketObservation(cityId, crop); return <><output>{state.status}:{state.data?.cityId ?? ''}</output><button onClick={state.retry}>重试</button></>; }
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
  expect(observations.mock.calls.map(args => args.slice(0, 2))).toEqual([['shenyang', undefined], ['chaoyang', undefined]]);
});

describe('same-city capability and crop reading lifecycles', () => {
  const base: MarketObservation = { ...empty('shenyang'), available: true, selectedCrop: '黄瓜', crops: ['黄瓜', '青椒'] };
  it('normalizing the default crop and switching modules do not refetch the city baseline', async () => {
    const observations = vi.fn().mockResolvedValue(base);
    vi.mocked(getMarketProvider).mockReturnValue({ observations });
    const { result, rerender } = renderHook(({ crop }) => useMarketObservation('shenyang', crop), { initialProps: { crop: undefined as string | undefined } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ crop: '黄瓜' });
    expect(result.current.status).toBe('ready');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ crop: undefined });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(observations).toHaveBeenCalledTimes(1);
    expect(result.current.available).toBe(true);
  });
  it('keeps confirmed capability while a new crop loads, without showing the previous crop reading', async () => {
    let resolveCrop!: (data: MarketObservation) => void;
    const observations = vi.fn((_city: string, crop?: string) => crop ? new Promise<MarketObservation>(resolve => { resolveCrop = resolve; }) : Promise.resolve(base));
    vi.mocked(getMarketProvider).mockReturnValue({ observations });
    const { result, rerender } = renderHook(({ crop }) => useMarketObservation('shenyang', crop), { initialProps: { crop: '黄瓜' } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ crop: '青椒' });
    expect(result.current.available).toBe(true);
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeUndefined();
    await act(async () => resolveCrop({ ...base, selectedCrop: '青椒' }));
    expect(result.current.data?.selectedCrop).toBe('青椒');
    rerender({ crop: '黄瓜' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ crop: '青椒' });
    await waitFor(() => expect(result.current.data?.selectedCrop).toBe('青椒'));
    expect(observations.mock.calls.map(args => args.slice(0, 2))).toEqual([['shenyang', undefined], ['shenyang', '青椒']]);
  });
  it('retry fetches fresh city data; a failed retry hides stale values while preserving known menu capability', async () => {
    const observations = vi.fn().mockResolvedValueOnce(base).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(base);
    vi.mocked(getMarketProvider).mockReturnValue({ observations });
    const { result } = renderHook(() => useMarketObservation('shenyang'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBeUndefined();
    expect(result.current.available).toBe(true);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(observations).toHaveBeenCalledTimes(3);
  });
  it('first-load failure remains recoverable through the existing retry control', async () => {
    const observations = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(empty('tieling'));
    vi.mocked(getMarketProvider).mockReturnValue({ observations });
    render(<Probe cityId="tieling"/>);
    await waitFor(() => expect(screen.getByText('error:')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.getByText('ready:tieling')).toBeTruthy());
  });
  it('resolves the potato UI name to the registered legacy crop without changing source IDs', async () => {
    const potatoBase = { ...empty('dalian'), available: true, selectedCrop: '黄瓜', crops: ['黄瓜', '马铃薯'] };
    const observations = vi.fn((_city: string, crop?: string) => Promise.resolve(crop ? { ...potatoBase, selectedCrop: crop } : potatoBase));
    vi.mocked(getMarketProvider).mockReturnValue({ observations });
    const { result, rerender } = renderHook(({ crop }) => useMarketObservation('dalian', crop), { initialProps: { crop: '土豆' } });
    await waitFor(() => expect(result.current.data?.selectedCrop).toBe('马铃薯'));
    expect(observations.mock.calls.map(args => args.slice(0, 2))).toEqual([['dalian', undefined], ['dalian', '马铃薯']]);
    rerender({ crop: '马铃薯' });
    await waitFor(() => expect(result.current.data?.selectedCrop).toBe('马铃薯'));
    expect(observations).toHaveBeenCalledTimes(2);
  });
});
