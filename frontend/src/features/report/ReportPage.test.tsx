// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import articleJson from '../../../public/research/shenyang/articles/A09.json';
import structureJson from '../../../public/research/shenyang/articles/A07.json';
import sourcesJson from '../../../public/research/shenyang/sources.json';
import type { V2Article } from '../../domain/research/v2/types';
import { ReportPage } from './ReportPage';
import { isProductSection } from './productContent';
import { useArticle } from '../research-v2/useV2';
vi.mock('../research-v2/useV2', () => ({ useArticle: vi.fn(), useSources: () => ({ status: 'ready', data: sourcesJson }) }));
vi.mock('../research-v2/blocks', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), TableAsset: ({ file }: { file: string }) => <div data-testid="table-asset" data-file={file} /> }));
vi.mock('../research-v2/Figure', () => ({ V2Figure: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));
const article = articleJson as V2Article;
const view = (city = 'shenyang') => <MemoryRouter initialEntries={[`/reports/${city}`]}><Routes><Route path="/reports/:cityId" element={<ReportPage />} /></Routes></MemoryRouter>;
beforeEach(() => vi.mocked(useArticle).mockReturnValue({ status: 'ready', data: article }));
afterEach(cleanup);
describe('正式报告共用三栏而完整保留研究资产', () => {
  it.each([article, structureJson as V2Article])('keeps product sections and every figure/table exactly once for $id, with real sources in the rail', currentArticle => {
    vi.mocked(useArticle).mockReturnValue({ status: 'ready', data: currentArticle });
    const { container } = render(view());
    const center = within(container.querySelector('.workbench__column')! as HTMLElement);
    for (const section of currentArticle.sections) {
      if (isProductSection(section.title)) expect(center.getByRole('heading', { name: section.title, level: 2 })).toBeTruthy();
      else expect(center.queryByRole('heading', { name: section.title, level: 2 })).toBeNull();
    }
    expect(container.textContent).not.toMatch(/外审待复核|A9 ·|沈阳 · 报告/);
    expect(container.querySelector('.workbench__rail .evidence-rail__title')).toBeNull();
    expect(center.queryAllByTestId('table-asset').map(node => node.getAttribute('data-file')).sort()).toEqual(currentArticle.tables.map(row => row.file).sort());
    expect(center.queryAllByRole('img').map(node => node.getAttribute('src')?.split('/').at(-1)).sort()).toEqual(currentArticle.figures.map(row => row.file).sort());
    const rail = within(screen.getByRole('complementary', { name: '报告依据' }));
    for (const id of currentArticle.source_ids) {
      const source = sourcesJson.find(row => row.source_id === id);
      if (source) expect(rail.getByText(source.title + (source.url ? ' ↗' : ''))).toBeTruthy();
    }
    const paper = container.querySelector('.workbench__paper'); const sidebar = container.querySelector('.workbench__sidebar');
    const first = currentArticle.sections[0];
    fireEvent.click(within(screen.getByRole('complementary', { name: '报告章节' })).getByRole('button', { name: first.title }));
    expect(container.querySelector('.workbench__paper')).toBe(paper); expect(container.querySelector('.workbench__sidebar')).toBe(sidebar);
    expect(document.activeElement?.textContent).toBe(first.title);
    expect(screen.queryByRole('link', { name: /进入决策|城市概览/ })).toBeNull();
  });
  it('loads the existing cross-city A11 instead of declaring it unpublished', () => {
    vi.mocked(useArticle).mockReturnValue({ status: 'loading' });
    render(view('liaoning'));
    expect(screen.getByRole('heading', { name: '辽宁六城研究报告' })).toBeTruthy();
    expect(useArticle).toHaveBeenCalledWith('cross_city','A11');expect(screen.getByText('报告载入中')).toBeTruthy();expect(screen.queryByText('研究内容待接入')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
