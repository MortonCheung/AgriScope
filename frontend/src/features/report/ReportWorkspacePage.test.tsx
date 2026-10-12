// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import articleJson from '../../../public/research/shenyang/articles/A09.json';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import type { V2Catalog, V2Article } from '../../domain/research/v2/types';
import { useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { useArticle } from '../research-v2/useV2';
import { ReportWorkspacePage } from './ReportWorkspacePage';

vi.mock('../../domain/research/runtime/catalog', async importOriginal => ({ ...await importOriginal<typeof import('../../domain/research/runtime/catalog')>(), useRuntimeCatalog: vi.fn() }));
vi.mock('../research-v2/useV2', () => ({ useArticle: vi.fn(), useSources: () => ({ status: 'ready', data: [] }) }));
vi.mock('../research-v2/blocks', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), TableAsset: () => <div /> }));
vi.mock('../research-v2/Figure', () => ({ V2Figure: () => <div /> }));
vi.mock('../cross-city/CrossCityPage', () => ({ CrossCityContent: () => <h1>比较内容</h1> }));
vi.mock('../cross-city/SynthesisPage', () => ({ SynthesisContent: () => <h1>综合内容</h1> }));
const article = articleJson as V2Article;
const catalog: V2Catalog = { schema_version: '2', generated_by: 'test', n_cities: 6, n_modules: 12, cities: STUDY_CITY_IDS.map(city => ({ city, city_name: getCity(city)!.shortName, n_modules: 2, modules: ['A09', 'A01'].map(module_id => ({ module_id, title: 'published', status: 'ACCEPTED', summary: null, article_path: 'article.json', explorer_available: module_id === 'A01', tables: [], figures: [], sources: [] })) })) };
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
  it('restores only the actual current-city interactive research link', () => {
    render(<MemoryRouter initialEntries={['/reports/chaoyang']}><Routes><Route path="/reports/:cityId" element={<ReportWorkspacePage />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('link', { name: '交互研究' }).getAttribute('href')).toBe('/cities/chaoyang?city=chaoyang');
    expect(screen.queryByText('朝阳 · 报告')).toBeNull();
  });
});
