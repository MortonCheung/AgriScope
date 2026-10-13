// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { AboutPage } from './AboutPage';
import sources from '../../../public/research/shenyang/sources.json';
import { METRIC_DEFINITIONS } from '../../domain/research/v2/metrics';
import { useReferences, useSources } from '../research-v2/useV2';

const resources = vi.hoisted(() => ({
  mounts: [] as string[],
  sourcesLoading: new Set<string>(),
  referencesLoading: new Set<string>(),
}));

vi.mock('../research-v2/useV2', () => ({
  useSources: vi.fn((cityId: string) => {
    useState(() => { resources.mounts.push(`sources:${cityId}`); return true; });
    return resources.sourcesLoading.has(cityId) ? { status: 'loading' } : { status: 'ready', data: sources };
  }),
  useReferences: vi.fn((cityId: string) => {
    useState(() => { resources.mounts.push(`references:${cityId}`); return true; });
    return resources.referencesLoading.has(cityId) ? { status: 'loading' } : { status: 'ready', data: '## 二、参考文献\n\n参考文献原文。' };
  }),
}));

function cityDetails(name: string): HTMLDetailsElement {
  return screen.getByText(`${name} · 来源与参考`).closest('details')!;
}

function toggleCity(name: string, open: boolean) {
  const details = cityDetails(name);
  details.open = open;
  fireEvent(details, new Event('toggle'));
  return details;
}

function changeHash(hash: string) {
  act(() => {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

/**
 * 关于页（本轮 §54 / §59-29）。
 * 比赛版本只保留 AgriScope：删除「求索研究系列」品牌与其 footer。
 */
describe('关于页不出现个人研究系列品牌', () => {
  beforeEach(() => {
    resources.mounts = []; resources.sourcesLoading.clear(); resources.referencesLoading.clear();
    vi.mocked(useSources).mockClear(); vi.mocked(useReferences).mockClear();
    window.history.replaceState(null, '', '/about');
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/about'); });

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
    expect(document.getElementById(`data-chaoyang-${sourceId}`)).toBeNull();
    toggleCity('朝阳', true);
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

  it('首屏仅挂载默认展开的沈阳来源，其他五城保留可展开入口', () => {
    const { container } = render(<AboutPage />);
    expect(container.querySelectorAll('.about__city-sources')).toHaveLength(6);
    expect(cityDetails('沈阳').open).toBe(true);
    expect(cityDetails('大连').open).toBe(false);
    expect(vi.mocked(useSources).mock.calls.map(([city]) => city)).toEqual(['shenyang']);
    expect(vi.mocked(useReferences).mock.calls.map(([city]) => city)).toEqual(['shenyang']);
    expect(container.querySelectorAll('.about__source-list')).toHaveLength(1);
    expect(container.querySelectorAll('.about__references')).toHaveLength(1);
  });

  it('大连首次展开才初始化，收起再展开保留同一来源节点和资源实例', () => {
    render(<AboutPage />);
    const sourceId = `data-dalian-${sources[0].source_id.toLowerCase()}`;
    expect(document.getElementById(sourceId)).toBeNull();
    toggleCity('大连', true);
    const original = document.getElementById(sourceId);
    expect(original).toBeTruthy();
    expect(resources.mounts.filter(value => value.endsWith(':dalian'))).toEqual(['sources:dalian', 'references:dalian']);
    toggleCity('大连', false);
    expect(cityDetails('大连').open).toBe(false);
    expect(document.getElementById(sourceId)).toBe(original);
    toggleCity('大连', true);
    expect(cityDetails('大连').open).toBe(true);
    expect(document.getElementById(sourceId)).toBe(original);
    expect(resources.mounts.filter(value => value.endsWith(':dalian'))).toHaveLength(2);
  });

  it('首次铁岭深链在尚未请求内容时展开对应城市，并在来源载入后滚动到真实节点', () => {
    const sourceId = `data-tieling-${sources[0].source_id.toLowerCase()}`;
    window.history.replaceState(null, '', `#${sourceId}`);
    resources.sourcesLoading.add('tieling');
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
    try {
      const view = render(<AboutPage />);
      expect(cityDetails('铁岭').open).toBe(true);
      expect(resources.mounts.filter(value => value.endsWith(':tieling'))).toHaveLength(2);
      expect(document.getElementById(sourceId)).toBeNull();
      resources.sourcesLoading.delete('tieling');
      view.rerender(<AboutPage />);
      const target = document.getElementById(sourceId);
      expect(target).toBeTruthy();
      expect(scroll.mock.instances).toContain(target);
    } finally { delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView; }
  });

  it('后续铁岭hashchange展开尚未挂载内容，已收起城市深链再次展开而不重建', () => {
    render(<AboutPage />);
    const sourceId = `data-tieling-${sources[0].source_id.toLowerCase()}`;
    expect(document.getElementById(sourceId)).toBeNull();
    changeHash(`#${sourceId}`);
    const original = document.getElementById(sourceId);
    expect(original).toBeTruthy();
    expect(cityDetails('铁岭').open).toBe(true);
    toggleCity('铁岭', false);
    changeHash('#methods');
    changeHash(`#${sourceId}`);
    expect(cityDetails('铁岭').open).toBe(true);
    expect(document.getElementById(sourceId)).toBe(original);
    expect(resources.mounts.filter(value => value.endsWith(':tieling'))).toHaveLength(2);
  });

  it('沈阳knowledge深链等待参考正文就绪后滚动，并可重新打开被收起的沈阳', () => {
    window.history.replaceState(null, '', '#knowledge');
    resources.referencesLoading.add('shenyang');
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
    try {
      const view = render(<AboutPage />);
      expect(document.getElementById('knowledge')).toBeNull();
      resources.referencesLoading.delete('shenyang');
      view.rerender(<AboutPage />);
      const target = document.getElementById('knowledge');
      expect(target).toBeTruthy();
      expect(scroll.mock.instances).toContain(target);
      toggleCity('沈阳', false);
      changeHash('#project');
      changeHash('#knowledge');
      expect(cityDetails('沈阳').open).toBe(true);
    } finally { delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView; }
  });
});
