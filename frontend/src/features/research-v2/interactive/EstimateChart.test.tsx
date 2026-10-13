// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EstimateChart, researchNumber, researchTimeValues } from './EstimateChart';

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('published estimates keep missing observations distinct from real zero', () => {
  it('parses finite values and rejects blank, whitespace, NaN and missing cells', () => {
    for (const value of ['', ' ', 'NaN', 'Infinity', undefined, null]) expect(researchNumber(value)).toBeUndefined();
    expect(researchNumber('0')).toBe(0);
    expect(researchNumber('-1.5')).toBe(-1.5);
    expect(researchNumber('1e-4')).toBe(.0001);
  });
  it('does not draw absent values or invented zero confidence intervals', () => {
    const rows = [{ crop: '黄瓜', beta: '', ci_low: '', ci_high: '' }, { crop: '甘蓝', beta: '0', ci_low: '', ci_high: '' }, { crop: '土豆', beta: '2', ci_low: '1', ci_high: '3' }];
    const { container } = render(<EstimateChart rows={rows} categoryKey="crop" valueKey="beta" ciLowKey="ci_low" ciHighKey="ci_high" />);
    expect(container.querySelectorAll('.estimate-chart__mark')).toHaveLength(2);
    expect(container.querySelectorAll('.estimate-chart__ci')).toHaveLength(1);
    expect(container.querySelectorAll('.estimate-chart__cat')[0].textContent).toBe('甘蓝');
  });
  it('supports keyboard and touch point inspection without a fabricated filter', () => {
    const { container, getByRole } = render(<EstimateChart rows={[{ crop: '黄瓜', beta: '2.5' }]} categoryKey="crop" valueKey="beta" />);
    const point = container.querySelector<SVGGElement>('.estimate-chart__mark')!;
    expect(getByRole('button', { name: '黄瓜 2.50' })).toBe(point);
    fireEvent.focus(point);
    expect(container.querySelector('.estimate-chart__readout-live')?.textContent).toContain('2.5');
    fireEvent.keyDown(point, { key: 'Enter' });
    expect(point.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(point);
    expect(container.querySelector('.estimate-chart__readout-live')).toBeTruthy();
  });
});

describe('real chart exploration', () => {
  it('shows the exact observation and interval in a keyboard and touch tooltip', () => {
    const { container, getByRole } = render(<EstimateChart rows={[{ crop: '黄瓜', beta: '2.5', ci_low: '1', ci_high: '3' }]}
      categoryKey="crop" valueKey="beta" ciLowKey="ci_low" ciHighKey="ci_high"/>);
    const readout = container.querySelector('.estimate-chart__readout-ghost');
    const point = getByRole('button', { name: '黄瓜 2.50' });
    fireEvent.focus(point);
    expect(getByRole('tooltip').textContent).toContain('黄瓜2.50');
    expect(getByRole('tooltip').textContent).toContain('置信区间 1.00 – 3.00');
    expect(point.getAttribute('aria-describedby')).toBe(getByRole('tooltip').id);
    fireEvent.click(point);
    fireEvent.pointerLeave(point);
    expect(getByRole('tooltip')).toBeTruthy();
    expect(container.querySelector('.estimate-chart__readout-ghost')).toBe(readout);
  });

  it('hides and restores only the actual estimate and confidence interval', () => {
    const rows = [{ crop: '黄瓜', beta: '2', ci_low: '1', ci_high: '3' }];
    const { container, getByRole } = render(<EstimateChart rows={rows} categoryKey="crop" valueKey="beta" ciLowKey="ci_low" ciHighKey="ci_high"/>);
    const svg = container.querySelector('svg[role="group"]');
    const axis = svg?.getAttribute('viewBox');
    const estimate = getByRole('button', { name: '系数 β' });
    const interval = getByRole('button', { name: '置信区间' });
    fireEvent.click(estimate);
    expect(container.querySelectorAll('.estimate-chart__dot')).toHaveLength(0);
    expect(container.querySelectorAll('.estimate-chart__ci')).toHaveLength(1);
    fireEvent.click(interval);
    expect(container.querySelectorAll('.estimate-chart__ci')).toHaveLength(0);
    expect(getByRole('status').textContent).toContain('已隐藏图形');
    fireEvent.click(estimate);
    fireEvent.click(interval);
    expect(container.querySelectorAll('.estimate-chart__dot')).toHaveLength(1);
    expect(container.querySelectorAll('.estimate-chart__ci')).toHaveLength(1);
    expect(svg?.getAttribute('viewBox')).toBe(axis);
    expect(rows[0]).toEqual({ crop: '黄瓜', beta: '2', ci_low: '1', ci_high: '3' });
  });

  it('does not advertise confidence intervals or time filters absent from the source', () => {
    const { queryByRole } = render(<EstimateChart rows={[{ crop: '黄瓜', beta: '0', ci_low: '', ci_high: '' }, { crop: '甘蓝', beta: '2', ci_low: '1', ci_high: '' }]}
      categoryKey="crop" valueKey="beta" ciLowKey="ci_low" ciHighKey="ci_high"/>);
    expect(queryByRole('button', { name: '置信区间' })).toBeNull();
    expect(queryByRole('combobox')).toBeNull();
  });

  it('filters a real year range without aggregating duplicate observations, then restores all rows', () => {
    const rows = [{ year: '2019', beta: '1' }, { year: '2020', beta: '2' }, { year: '2020', beta: '3' }, { year: '2021', beta: '4' }];
    const { container, getByRole } = render(<EstimateChart rows={rows} categoryKey="year" valueKey="beta"/>);
    const svg = container.querySelector('svg[role="group"]');
    const start = getByRole('combobox', { name: '年份起点' });
    fireEvent.click(start);
    fireEvent.click(getByRole('option', { name: '2020' }));
    expect(container.querySelectorAll('.estimate-chart__mark')).toHaveLength(3);
    expect([...container.querySelectorAll('.estimate-chart__cat')].map(node => node.textContent)).toEqual(['2020', '2020', '2021']);
    expect(container.querySelector('svg[role="group"]')).toBe(svg);
    fireEvent.click(getByRole('button', { name: '全部' }));
    expect(container.querySelectorAll('.estimate-chart__mark')).toHaveLength(4);
    expect(rows).toHaveLength(4);
  });

  it('uses only source month/year/date categories and rejects invalid calendars', () => {
    expect(researchTimeValues(['12', '2', '1', '2'], 'month')).toEqual(['1', '2', '12']);
    expect(researchTimeValues(['2021', '2019'], 'year')).toEqual(['2019', '2021']);
    expect(researchTimeValues(['2020-02-29', '2020-02-28'], 'date')).toEqual(['2020-02-28', '2020-02-29']);
    expect(researchTimeValues(['2019-02-29', '2019-02-28'], 'date')).toEqual([]);
    expect(researchTimeValues(['0', '13'], 'month')).toEqual([]);
    expect(researchTimeValues(['黄瓜', '甘蓝'], 'crop')).toEqual([]);
    expect(researchTimeValues(['2020', '2020'], 'year')).toEqual([]);
  });
});

describe('same-instance chart focus', () => {
  beforeEach(() => {
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value: vi.fn(function(this: HTMLDialogElement) { this.setAttribute('open', ''); this.dataset.modal = 'true'; }) },
      show: { configurable: true, value: vi.fn(function(this: HTMLDialogElement) { this.setAttribute('open', ''); delete this.dataset.modal; }) },
      close: { configurable: true, value: vi.fn(function(this: HTMLDialogElement) { this.removeAttribute('open'); delete this.dataset.modal; }) },
    });
  });
  afterEach(() => {
    for (const key of ['showModal', 'show', 'close']) Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  });

  it('promotes the existing DOM to a native modal and restores the trigger focus without losing point or legend state', () => {
    const { container, getByRole } = render(<EstimateChart rows={[{ crop: '黄瓜', beta: '2.5', ci_low: '1', ci_high: '3' }]}
      categoryKey="crop" valueKey="beta" ciLowKey="ci_low" ciHighKey="ci_high"/>);
    const chart = container.querySelector('.estimate-chart');
    const svg = container.querySelector('svg[role="group"]');
    fireEvent.click(getByRole('button', { name: '黄瓜 2.50' }));
    fireEvent.click(getByRole('button', { name: '置信区间' }));
    const trigger = getByRole('button', { name: '放大图表' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(getByRole('dialog')).toBe(chart);
    expect(chart?.getAttribute('aria-modal')).toBe('true');
    expect(chart?.getAttribute('data-modal')).toBe('true');
    expect(container.querySelector('svg[role="group"]')).toBe(svg);
    expect(getByRole('tooltip').textContent).toContain('黄瓜2.50');
    expect(container.querySelectorAll('.estimate-chart__ci')).toHaveLength(0);
    expect(document.activeElement).toBe(getByRole('button', { name: '关闭放大' }));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(getByRole('button', { name: '关闭放大' }));
    expect(container.querySelector('.estimate-chart')).toBe(chart);
    expect(chart?.getAttribute('open')).toBe('');
    expect(chart?.hasAttribute('aria-modal')).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('consumes native Escape cancellation and restores the same chart rather than closing its page', () => {
    const { container, getByRole } = render(<EstimateChart rows={[{ crop: '黄瓜', beta: '1' }]} categoryKey="crop" valueKey="beta"/>);
    const chart = container.querySelector('.estimate-chart')!;
    const trigger = getByRole('button', { name: '放大图表' });
    fireEvent.click(trigger);
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(chart, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(chart.hasAttribute('aria-modal')).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(container.querySelectorAll('.estimate-chart')).toHaveLength(1);
  });

  it('keeps a real range while enlarged and closes the inside dropdown before the chart', () => {
    const rows = [{ month: '1', beta: '1' }, { month: '2', beta: '2' }, { month: '3', beta: '3' }];
    const { container, getByRole, queryByRole } = render(<EstimateChart rows={rows} categoryKey="month" valueKey="beta"/>);
    fireEvent.click(getByRole('combobox', { name: '月份起点' }));
    fireEvent.click(getByRole('option', { name: '2' }));
    const svg = container.querySelector('svg[role="group"]');
    fireEvent.click(getByRole('button', { name: '放大图表' }));
    const modal = getByRole('dialog');
    expect(container.querySelectorAll('.estimate-chart__mark')).toHaveLength(2);
    expect(getByRole('combobox', { name: '月份起点' }).textContent).toBe('2');
    const end = getByRole('combobox', { name: '月份终点' });
    fireEvent.click(end);
    expect(modal.contains(getByRole('listbox'))).toBe(true);
    fireEvent.keyDown(end, { key: 'Escape', cancelable: true });
    expect(queryByRole('listbox')).toBeNull();
    expect(getByRole('dialog')).toBe(modal);
    expect(container.querySelector('svg[role="group"]')).toBe(svg);
    fireEvent.click(getByRole('button', { name: '关闭放大' }));
    expect(getByRole('combobox', { name: '月份起点' }).textContent).toBe('2');
  });

  it('returns to the ordinary chart if the browser cannot promote it to the top layer', () => {
    vi.mocked(HTMLDialogElement.prototype.showModal).mockImplementationOnce(() => { throw new Error('Unavailable top layer'); });
    const { container, getByRole, queryByRole } = render(<EstimateChart rows={[{ crop: '黄瓜', beta: '1' }]} categoryKey="crop" valueKey="beta"/>);
    const trigger = getByRole('button', { name: '放大图表' });
    fireEvent.click(trigger);
    expect(queryByRole('dialog')).toBeNull();
    expect(container.querySelector('.estimate-chart')?.hasAttribute('open')).toBe(true);
    expect(container.querySelectorAll('.estimate-chart__mark')).toHaveLength(1);
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(document.activeElement).toBe(trigger);
  });

  it('restores background scrolling when an expanded chart is removed', () => {
    const { getByRole, unmount } = render(<EstimateChart rows={[{ crop: '黄瓜', beta: '1' }]} categoryKey="crop" valueKey="beta"/>);
    document.body.style.overflow = 'auto';
    fireEvent.click(getByRole('button', { name: '放大图表' }));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });
});
