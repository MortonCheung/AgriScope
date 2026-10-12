// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AboutPage } from './AboutPage';
import sources from '../../../public/research/shenyang/sources.json';
import { METRIC_DEFINITIONS } from '../../domain/research/v2/metrics';

vi.mock('../research-v2/useV2', () => ({
  useSources: () => ({ status: 'ready', data: sources }),
  useReferences: () => ({ status: 'ready', data: '## 二、参考文献\n\n参考文献原文。' }),
}));

/**
 * 关于页（本轮 §54 / §59-29）。
 * 比赛版本只保留 AgriScope：删除「求索研究系列」品牌与其 footer。
 */
describe('关于页不出现个人研究系列品牌', () => {
  beforeEach(() => { vi.stubGlobal('fetch', () => Promise.reject(new Error('offline'))); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = ''; });

  it('没有「求索」字样，也没有 about__foot 节点', () => {
    const { container } = render(<AboutPage />);
    expect(container.textContent ?? '').not.toContain('求索');
    expect(container.querySelector('.about__foot')).toBeNull();
  });

  it('只保留三个主题，同时保留六城来源和全部指标深链', () => {
    const { container } = render(<AboutPage />);
    expect(screen.getByRole('heading', { level: 1, name: '关于' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['项目介绍', '数据来源', '方法说明']);
    expect(container.querySelectorAll('.about__city-sources')).toHaveLength(6);
    for (const metric of METRIC_DEFINITIONS) expect(document.getElementById(`metric-${metric.id}`)).toBeTruthy();
    const sourceId = sources[0].source_id.toLowerCase();
    expect(document.getElementById(`data-${sourceId}`)).toBeTruthy();
    expect(document.getElementById(`data-chaoyang-${sourceId}`)).toBeTruthy();
    const ids = [...container.querySelectorAll('[id]')].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(container.textContent).not.toMatch(/技术架构|局限与边界|当前冻结记录|代码指纹|本轮准备|尚未开启/);
  });

  it('来源深链打开对应城市，非法编码的hash不造成页面异常', () => {
    const sourceId = sources[0].source_id.toLowerCase();
    window.location.hash = `#data-chaoyang-${sourceId}`;
    render(<AboutPage />);
    expect(document.getElementById(`data-chaoyang-${sourceId}`)?.closest('details')?.open).toBe(true);
    cleanup();
    window.location.hash = '#%E0%A4%A';
    expect(() => render(<AboutPage />)).not.toThrow();
  });
});
