// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import articleJson from '../../../public/research/shenyang/articles/A09.json';
import runtimeCatalog from '../../../../runtime/research/research_catalog.json';
import type { V2Catalog, V2Article } from '../../domain/research/v2/types';
import { useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { useArticle } from '../research-v2/useV2';
import { ReportWorkspacePage } from './ReportWorkspacePage';

vi.mock('../../domain/research/runtime/catalog', async importOriginal => ({ ...await importOriginal<typeof import('../../domain/research/runtime/catalog')>(), useRuntimeCatalog: vi.fn() }));
vi.mock('../research-v2/useV2', () => ({ useArticle: vi.fn(), useTable: () => ({ status: 'ready', data: { columns: [], rows: [] } }), useSources: () => ({ status: 'ready', data: [] }) }));
vi.mock('../research-v2/blocks', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), TableAsset: () => <div /> }));
vi.mock('../research-v2/InteractivePointView', () => ({ InteractivePointView: ({ point }: {point: {id:string;title:string}}) => <section data-point={point.id}><h1>{point.title}</h1><svg role="img" aria-label="已校验研究数据"/></section> }));
vi.mock('../research-v2/TopicExplorer', () => ({ TopicExplorer: ({cityId,explorer}: {cityId:string;explorer:{id:string}}) => <svg role="img" aria-label={`${cityId}:${explorer.id}`}/> }));
vi.mock('../research-v2/Figure', () => ({ V2Figure: () => <div /> }));
vi.mock('../cross-city/CrossCityPage', () => ({ CrossCityContent: () => <h1>比较内容</h1> }));
vi.mock('../cross-city/SynthesisPage', () => ({ SynthesisContent: () => <h1>综合内容</h1> }));
const article = articleJson as V2Article;
const catalog = runtimeCatalog as unknown as V2Catalog;
const paths = ['/reports', '/reports/shenyang', '/reports/chaoyang', '/reports?view=cross_city', '/reports?view=synthesis', '/reports/liaoning'];
function Controls() {
  const navigate = useNavigate();
  return <div>{paths.map((path, index) => <button key={path} onClick={() => navigate(path)}>位置{index}</button>)}<button onClick={() => navigate(-1)}>后退</button><button onClick={() => navigate(1)}>前进</button></div>;
}
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.mocked(useRuntimeCatalog).mockReturnValue({ status: 'ready', catalog });
  vi.mocked(useArticle).mockImplementation((scope, id) => id ? { status: 'ready', data: { ...article, title: `${scope}已发布报告` } } : { status: 'loading' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('one report paper across all workspace selections', () => {
  it('preserves paper/sidebar/main/rail nodes through entry, cities, composites and POP', () => {
    const { container } = render(<MemoryRouter initialEntries={['/reports']}><Controls /><Routes><Route path="/reports" element={<ReportWorkspacePage />} /><Route path="/reports/:cityId" element={<ReportWorkspacePage />} /></Routes></MemoryRouter>);
    const selectors = ['.workbench__paper', '.workbench__sidebar', '.workbench__column', '.workbench__rail'];
    const nodes = selectors.map(selector => container.querySelector(selector));
    const assertStable = () => selectors.forEach((selector, index) => expect(container.querySelector(selector)).toBe(nodes[index]));
    expect(screen.getByRole('heading', { name: '城市报告' })).toBeTruthy();
    expect(container.querySelectorAll('.report-navigation__cities')).toHaveLength(1);
    for (const index of [1, 2, 3, 4, 5]) {
      fireEvent.click(screen.getByRole('button', { name: `位置${index}` }));
      assertStable();
      expect(container.querySelectorAll('.workbench__paper')).toHaveLength(1);
    }
    fireEvent.click(screen.getByRole('button', { name: '后退' }));
    expect(screen.getByRole('heading', { name: '综合内容' })).toBeTruthy();
    assertStable();
    fireEvent.click(screen.getByRole('button', { name: '前进' }));
    assertStable();
    fireEvent.click(screen.getByRole('button', { name: '位置0' }));
    assertStable();
    expect(screen.getByRole('heading', { name: '城市报告' })).toBeTruthy();
  });
  it('opens a verified interactive module first and keeps full text as a secondary action', () => {
    render(<MemoryRouter initialEntries={['/reports/tieling']}><Routes><Route path="/reports/:cityId" element={<ReportWorkspacePage/>}/></Routes></MemoryRouter>);
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', {name:'交互研究'}).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', {name:'完整文章'}));
    expect(screen.getByRole('tab', {name:'完整文章'}).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('uses the published Shenyang default point and filters unqualified research points', () => {
    const {container}=render(<MemoryRouter initialEntries={['/reports/shenyang']}><Routes><Route path="/reports/:cityId" element={<ReportWorkspacePage/>}/></Routes></MemoryRouter>);
    expect(container.querySelector('[data-point]')?.getAttribute('data-point')).toBe('A1.3');
    expect(container.querySelector('main')?.getAttribute('data-rail-mode')).toBe('responsive');
    expect(screen.queryByText('A4.4')).toBeNull();
    expect(container.querySelectorAll('.workbench__paper')).toHaveLength(1);
  });
  it('replaces the excluded Tieling deep selection with a valid URL and content', async () => {
    const {container}=render(<MemoryRouter initialEntries={['/reports/tieling?research=A6&crop=玉米&as_of=2026-10-06']}><Routes><Route path="/reports/:cityId" element={<ReportWorkspacePage/>}/></Routes></MemoryRouter>);
    await screen.findByRole('tab', {name:'交互研究'});
    expect(container.querySelectorAll('.workbench__paper')).toHaveLength(1);
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    expect(screen.queryByText('市场可预测性与天气信息预测增量')).toBeNull();
  });
});
