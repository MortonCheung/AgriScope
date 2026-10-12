// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { DecisionPage } from './DecisionPage';
import { CityDecisionEntry } from './CityDecisionEntry';
import { resetAppContext } from '../../app/context/appContext';
vi.mock('../../domain/observations/useObservations', () => ({ useObservations: () => ({ status: 'error', error: 'connection' }) }));
vi.mock('./useMarketObservation', () => ({ useMarketObservation: () => ({ status: 'error', error: 'connection', retry: vi.fn() }) }));
beforeEach(() => {
  sessionStorage.clear(); resetAppContext();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function ReturnHome() { const navigate = useNavigate(); return <button onClick={() => navigate('/decisions')}>返回</button>; }
function renderFlow() { return render(<MemoryRouter initialEntries={['/decisions']}><ReturnHome/><Routes><Route path="/decisions" element={<CityDecisionEntry/>}/><Route path="/cities/:cityId/decision" element={<DecisionPage/>}/></Routes></MemoryRouter>); }
const choices = () => within(screen.getByRole('group', { name: '作物' }));
const results = () => within(screen.getByRole('region', { name: '农业决策结果' }));
function set(label: string | RegExp, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
describe('product decision round trip', () => {
  it('enters in one click, calculates on input, returns and restores valid conditions', async () => {
    renderFlow(); fireEvent.click(screen.getByRole('link', { name: '铁岭' }));
    expect(await screen.findByRole('heading', { name: '输入条件' })).toBeTruthy();
    fireEvent.click(choices().getByRole('button', { name: '玉米' }));
    set(/^种植面积/, '10'); set(/^预计亩产/, '500'); set(/^每亩总成本/, '1000'); set(/^假设销售价格/, '4'); set(/^可销售比例/, '80');
    set(/^可用预算/, '20000'); set('销售时间', '2026-11-20');
    expect(results().getByText('预计收益').nextElementSibling?.textContent).toBe('6,000 元');
    const activeInput = screen.getByLabelText(/^假设销售价格/); activeInput.focus();
    set(/^假设销售价格/, '5'); expect(results().getByText('预计收益').nextElementSibling?.textContent).toBe('10,000 元'); expect(document.activeElement).toBe(activeInput);
    fireEvent.click(screen.getByRole('button', { name: '返回' })); expect(screen.getByRole('navigation', { name: '选择决策城市' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: '铁岭' }));
    await waitFor(() => expect(results().getByText('预计收益').nextElementSibling?.textContent).toBe('10,000 元'));
    expect((screen.getByLabelText('销售时间') as HTMLInputElement).value).toBe('2026-11-20');
  });
  it('survives an invalid custom crop, city switch and re-entry with the complete option set', async () => {
    renderFlow(); fireEvent.click(screen.getByRole('link', { name: '沈阳' }));
    fireEvent.click(choices().getByRole('button', { name: '自定义作物' })); set('作物名称', 'bad!');
    expect(screen.getByRole('alert').textContent).toContain('作物名');
    const before = choices().getAllByRole('button').map(button => button.textContent);
    fireEvent.click(within(screen.getByRole('navigation', { name: '决策城市' })).getByRole('link', { name: '朝阳' }));
    await waitFor(() => expect(choices().getAllByRole('button').map(button => button.textContent)).toEqual(before));
    fireEvent.click(within(screen.getByRole('navigation', { name: '决策城市' })).getByRole('link', { name: '沈阳' }));
    await waitFor(() => expect((screen.getByLabelText('作物名称') as HTMLInputElement).value).toBe('bad!'));
    set('作物名称', '草莓'); set(/^种植面积/, '1'); set(/^预计亩产/, '100'); set(/^每亩总成本/, '50'); set(/^假设销售价格/, '1');
    expect(results().getByText('预计收益').nextElementSibling?.textContent).toBe('50 元');
    expect(choices().getAllByRole('button').map(button => button.textContent)).toEqual(before);
  });
});
