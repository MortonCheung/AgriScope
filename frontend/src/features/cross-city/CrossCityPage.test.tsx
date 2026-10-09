// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CrossCityPage } from './CrossCityPage';

/**
 * 跨城比较专用页（§25 / §25.1）。
 *
 * 守的是页面主诉求：
 *   1. 指标切换 + 可比较性标注在位；
 *   2. 价格口径红线（明确不做菜价排行）在位；
 *   3. 城际配对表的英文枚举（same / mixed / D / W）在界面上被换成中文，且逐行标可比性；
 *   4. 地图按当前指标表真实出现过的城市高亮。
 */

const TABLES: Record<string, string> = {
  'cross_city_production_concentration.csv':
    'city,HHI,CR4,n_crops,years,top3\n朝阳,0.690736,0.983337,8,"[2018, 2024]",玉米 82.4%\n大连,0.479815,0.950174,8,"[2018, 2024]",玉米 66.8%\n丹东,0.497732,0.983598,8,"[2018, 2022]",玉米 65.2%',
  'cross_city_seasonal_sync.csv':
    'crop,city_a,city_b,seasonal_corr,n_months,freq_a,freq_b,freq_pair\n西红柿,朝阳,大连,0.472492,12,D,W,mixed\n西红柿,朝阳,锦州,0.967290,12,D,D,same',
};

const A10 = {
  id: 'A10',
  city: '辽宁六城',
  slug: 'cross-city-liaoning',
  title: '辽宁六城农业市场与风险比较研究',
  abstract: '研究摘要文本。',
  frontend_summary: '六城对比摘要。',
  keywords: [] as string[],
  research_questions: [] as string[],
  data_scope: { summary: '' },
  methods: [] as { summary: string }[],
  key_findings: [] as { heading: string }[],
  sections: [] as { number: string; title: string; content: string }[],
  limitations: ['1. **价格层级不可比**：仅相对/结构化比较，不做价格水平比较。'],
  conclusion: '研究结论原文。',
  figures: [{ file: 'cross_city_overview.png' }],
  tables: [{ file: 'cross_city_production_concentration.csv' }],
  source_ids: [] as string[],
  status: 'DRAFT',
};

const GEO = {
  type: 'FeatureCollection',
  features: [
    { properties: { name: '朝阳市' }, geometry: { type: 'Polygon', coordinates: [[[120, 41], [121, 41], [121, 42], [120, 42], [120, 41]]] } },
    { properties: { name: '大连市' }, geometry: { type: 'Polygon', coordinates: [[[121, 38], [122, 38], [122, 39], [121, 39], [121, 38]]] } },
  ],
};

function json(value: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(value), text: () => Promise.resolve('') });
}
function text(value: string) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(value) });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/research']}>
      <Routes>
        <Route path="/research" element={<CrossCityPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('跨城比较专用页', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', (url: string) => {
      if (url.includes('/geo/liaoning.json')) return json(GEO);
      if (url.includes('/articles/A10.json')) return json(A10);
      const match = /\/tables\/([^/?]+)$/.exec(url);
      if (match && TABLES[match[1]]) return text(TABLES[match[1]]);
      return Promise.reject(new Error('offline'));
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('指标切换、可比性标注与价格口径红线都在位', async () => {
    const { container } = renderPage();
    const text2 = () => container.textContent ?? '';

    expect(text2()).toContain('辽宁六城农业市场与风险比较研究');
    expect(text2()).toContain('不提供六城菜价排行');
    expect(screen.getByRole('button', { name: '生产集中度 HHI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '区域领先/滞后（最佳滞后相关系数）' })).toBeTruthy();

    // 默认 HHI：可直接比较 + 探索性图例都出现。
    expect(text2()).toContain('可直接比较');
    expect(text2()).toContain('探索性比较');

    // 城市高亮来自当前指标表里真实出现过的城市（朝阳 / 大连 / 丹东）。
    await waitFor(() => expect(container.querySelectorAll('.cx-map__city[data-highlighted]').length).toBeGreaterThan(0));
    expect(container.querySelector('.cx-bars')).not.toBeNull();
  });

  it('城际配对表用中文枚举并逐行标可比性，不泄漏 same/mixed/D/W', async () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: '市场季节同步（城际配对）' }));

    await waitFor(() => expect(screen.getByText('同频率')).toBeTruthy());
    const text2 = container.textContent ?? '';
    expect(text2).toContain('频率不同');
    expect(text2).toContain('不可直接比较');
    // 英文枚举不得出现在界面上。
    expect(text2).not.toContain('same');
    expect(text2).not.toContain('mixed');
    expect(text2).not.toMatch(/\bD\b/);
    expect(text2).not.toMatch(/\bW\b/);
  });
});