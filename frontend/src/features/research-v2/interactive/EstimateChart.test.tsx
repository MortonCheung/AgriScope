// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EstimateChart, researchNumber } from './EstimateChart';

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
