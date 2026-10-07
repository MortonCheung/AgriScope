// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AboutPage } from './AboutPage';

/**
 * 关于页（本轮 §54 / §59-29）。
 * 比赛版本只保留 AgriScope：删除「求索研究系列」品牌与其 footer。
 */
describe('关于页不出现个人研究系列品牌', () => {
  beforeEach(() => { vi.stubGlobal('fetch', () => Promise.reject(new Error('offline'))); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('没有「求索」字样，也没有 about__foot 节点', () => {
    const { container } = render(<AboutPage />);
    expect(container.textContent ?? '').not.toContain('求索');
    expect(container.querySelector('.about__foot')).toBeNull();
  });
});
