// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import { citySources, sourcesForScope } from '../../domain/sources/dataSources';
import { DataSourceLinks } from './DataSourceLinks';
vi.mock('motion/react', () => ({ useReducedMotion: () => true }));
afterEach(cleanup);

describe('范围明确的小票来源', () => {
  it.each(['liaoning', ...STUDY_CITY_IDS])('%s 来源两个真实外部入口，名称/地址/范围同步且不显示URL', scope => {
    const { container } = render(<DataSourceLinks scope={scope}/>);
    expect(screen.getByRole('region', { name: '数据来源' }).getAttribute('data-source-scope')).toBe(scope);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    for (const source of sourcesForScope(scope).items) {
      const link = screen.getByRole('link', { name: source.name });
      expect(link.getAttribute('href')).toBe(source.url);
      expect(new URL(source.url).protocol).toBe('https:');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(container.textContent).not.toMatch(/https?:|www\.|待补充|模拟|演示/);
  });
  it('无城市或非法城市安全回到辽宁，不接受任意外链输入', () => {
    for (const invalid of [null, '', 'unknown', 'https://example.org']) {
      expect(sourcesForScope(invalid)).toEqual({ scope: 'liaoning', items: citySources.liaoning });
    }
  });
  it('二十次切换保留区块及链接槽，href与当前名称一致，同范围刷新不重建', () => {
    const opened = render(<DataSourceLinks scope={null}/>);
    const block = opened.container.querySelector('.data-source-links');
    const anchors = screen.getAllByRole('link');
    for (let index = 0; index < 20; index++) {
      const city = STUDY_CITY_IDS[index % STUDY_CITY_IDS.length];
      opened.rerender(<DataSourceLinks scope={city}/>);
      expect(opened.container.querySelector('.data-source-links')).toBe(block);
      sourcesForScope(city).items.forEach((source, position) => {
        const link = screen.getByRole('link', { name: source.name });
        expect(link).toBe(anchors[position]);
        expect(link.getAttribute('href')).toBe(source.url);
      });
    }
    opened.rerender(<DataSourceLinks scope={STUDY_CITY_IDS[19 % STUDY_CITY_IDS.length]}/>);
    expect(screen.getAllByRole('link')).toEqual(anchors);
  });  it('验证来源列表优先于地域参考网站，显式空列表不借参考链接', () => {
    const source = { name: 'TEST verified observation source', url: 'https://example.test/observations' };
    const { rerender } = render(<DataSourceLinks scope="shenyang" items={[source]}/>);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: source.name }).getAttribute('href')).toBe(source.url);
    expect(screen.queryByRole('link', { name: citySources.shenyang[0].name })).toBeNull();
    rerender(<DataSourceLinks scope="shenyang" items={[]}/>);
    expect(screen.queryByRole('region', { name: '数据来源' })).toBeNull();
  });

});
