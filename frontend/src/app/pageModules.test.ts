// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { lazyPage, preloadPage } from './pageModules';
const page = vi.hoisted(() => ({ AboutPage: () => null, ReportWorkspacePage: () => null }));
vi.mock('../features/about/AboutPage', () => ({ AboutPage: page.AboutPage }));
vi.mock('../features/report/ReportWorkspacePage', () => ({ ReportWorkspacePage: page.ReportWorkspacePage }));
describe('路由模块准备', () => {
  it('提前加载和实际路由使用同一模块，关于和报告的入口功能不变', async () => {
    preloadPage('/about'); preloadPage('/about');
    expect((await lazyPage('about', 'AboutPage')()).Component).toBe(page.AboutPage);
    preloadPage('/reports/shenyang?city=shenyang');
    expect((await lazyPage('reports', 'ReportWorkspacePage')()).Component).toBe(page.ReportWorkspacePage);
    preloadPage('/reports?view=cross_city'); preloadPage('/research');
    expect((await lazyPage('reports', 'ReportWorkspacePage')()).Component).toBe(page.ReportWorkspacePage);
    expect(() => preloadPage('/unknown')).not.toThrow();
  });
});
