// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adaptDailySnapshot } from '../../domain/daily/adapter';
import type { DailyState } from '../../domain/daily/types';
import { DailyContext, dailyChangeText } from './DailyContext';
import { DAILY_TEST_NOW, dailyTestRaw } from './daily.testData';

const mocked = vi.hoisted(() => ({ state: { status: 'loading' } as DailyState }));
vi.mock('./useDaily', () => ({ useDaily: () => mocked.state }));
beforeEach(() => { mocked.state = { status: 'ready', data: adaptDailySnapshot(dailyTestRaw(), DAILY_TEST_NOW) }; });
afterEach(cleanup);

describe('Daily market context', () => {
  it('formats fractional changes once, preserving zero and missing measurements', () => {
    expect(dailyChangeText(0.043243)).toBe('+4.3%');
    expect(dailyChangeText(-0.035088)).toBe('-3.5%');
    expect(dailyChangeText(0)).toBe('0%');
    expect(dailyChangeText(null)).toBe('—');
  });

  it('shows the canonical crop, observation date and kg unit, with native progressive disclosure', () => {
    render(<DailyContext cityId="shenyang" crop="西红柿" />);
    expect(screen.getByText('4.4 元/kg')).toBeTruthy();
    expect(screen.getByText('数据截至 2026年10月7日')).toBeTruthy();
    expect(screen.getByText('留意')).toBeTruthy();
    expect(screen.getByText('官方批发观测；市场信号为发布时的模型评估。').closest('details')).toBeNull();
    const summary = screen.getByText('查看近期变化');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.closest('details')?.open).toBe(false);
    expect(screen.getByText('前一观测')).toBeTruthy();
    expect(screen.getByText('+4.3%')).toBeTruthy();
    expect(screen.getByRole('link', { name: '官方价格来源 ↗' }).getAttribute('href')).toBe('https://example.org/prices');
  });

  it.each([['2026-10-06', '发布延迟'], ['2026-10-04', '数据较旧'], ['2026-09-29', '近期数据缺失']] as const)('makes effective freshness visible for %s', (date, label) => {
    mocked.state = { status: 'ready', data: adaptDailySnapshot(dailyTestRaw(date), DAILY_TEST_NOW) };
    render(<DailyContext cityId="shenyang" />);
    expect(screen.getByText(`· ${label}`)).toBeTruthy();
  });

  it('does not use fuzzy crop matches in the decision detail context', () => {
    render(<DailyContext cityId="shenyang" crop="番茄" />);
    expect(screen.getByText('番茄的每日市场数据暂未接入')).toBeTruthy();
    expect(screen.queryByText('4.4 元/kg')).toBeNull();
  });

  it('shows observed price and an unassessed signal when inference is unavailable', () => {
    const raw = dailyTestRaw();
    mocked.state = { status: 'ready', data: adaptDailySnapshot({ ...raw, crops: [{ ...raw.crops[0], daily_signal: null, model_status: 'MODEL_UNAVAILABLE' }] }, DAILY_TEST_NOW) };
    render(<DailyContext cityId="shenyang" crop="西红柿" />);
    expect(screen.getByText('4.4 元/kg')).toBeTruthy();
    expect(screen.getByText('信号待评估')).toBeTruthy();
  });

  it('labels a supplied legacy signal instead of presenting it as a Final result', () => {
    const raw = dailyTestRaw();
    mocked.state = { status: 'ready', data: adaptDailySnapshot({ ...raw, model: { ...raw.model, model_status: 'LEGACY_FALLBACK' } }, DAILY_TEST_NOW) };
    render(<DailyContext cityId="shenyang" />);
    expect(screen.getByText('历史信号 · 留意')).toBeTruthy();
    expect(screen.getByText('官方批发观测；市场信号为发布时的历史模型评估。')).toBeTruthy();
  });

  it('displays a small loading state without invented price data', () => {
    mocked.state = { status: 'loading' };
    render(<DailyContext cityId="shenyang" />);
    expect(screen.getByLabelText('最新市场').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('读取官方日度数据')).toBeTruthy();
    expect(screen.queryByText('4.4 元/kg')).toBeNull();
  });

  it('displays an API failure without a fixture fallback', () => {
    mocked.state = { status: 'error', error: 'API offline' };
    render(<DailyContext cityId="shenyang" />);
    expect(screen.getByRole('status').textContent).toBe('市场数据暂时无法加载');
    expect(screen.queryByText('4.4 元/kg')).toBeNull();
  });

  it('does not add an empty market block to unsupported cities', () => {
    mocked.state = { status: 'unsupported' };
    const { container } = render(<DailyContext cityId="chaoyang" />);
    expect(container.innerHTML).toBe('');
  });
});
