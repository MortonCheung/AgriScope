// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { resetAppContext, useAppContext } from './appContext';
import { navigationContext, primaryNavigationTarget, rememberReportLocation } from './navigationContext';

beforeEach(() => { window.sessionStorage.clear(); resetAppContext(); });
const context = { cityId: 'shenyang', crop: '黄瓜', horizon: 14 as const, asOf: '2026-10-06' };

describe('全局任务入口保留实际观察上下文', () => {
  it('路径城市优先于query和旧上下文；正式条件从当前URL取', () => {
    const location = { pathname: '/cities/dandong/decision', search: '?city=chaoyang&crop=玉米&horizon=30&as_of=2026-09-14' };
    expect(navigationContext(location, context)).toEqual({ cityId: 'dandong', crop: '玉米', horizon: 30, asOf: '2026-09-14' });
    const target = primaryNavigationTarget('decision', location, context);
    expect(target.split('?')[0]).toBe('/cities/dandong/decision');
    expect(Object.fromEntries(new URLSearchParams(target.split('?')[1]))).toEqual({ city: 'dandong', crop: '玉米', horizon: '30', as_of: '2026-09-14' });
  });

  it('无选城主页不继承上次沈阳；选城主页和其他任务保留明确选择', () => {
    expect(primaryNavigationTarget('decision', { pathname: '/liaoning', search: '' }, context)).toBe('/decision');
    expect(primaryNavigationTarget('reports', { pathname: '/', search: '' }, context)).toBe('/research');
    expect(primaryNavigationTarget('home', { pathname: '/cities/dandong/decision', search: '' }, context)).toBe('/liaoning?city=dandong');
    expect(primaryNavigationTarget('decision', { pathname: '/liaoning', search: '?city=tieling' }, context)).toContain('/cities/tieling/decision?');
  });

  it('报告定位按城保存，往返不会串用其他城市研究点或决策plan', () => {
    rememberReportLocation({ pathname: '/cities/shenyang/research/A2.2', search: '?mode=article&city=dandong&plan=old' });
    rememberReportLocation({ pathname: '/cities/dandong/research/A7', search: '?mode=article&research=A2.2&view=result' });
    const sy = primaryNavigationTarget('reports', { pathname: '/cities/shenyang/decision', search: '?crop=西红柿&horizon=30' }, context);
    expect(sy.split('?')[0]).toBe('/cities/shenyang/research/A2.2');
    const query = new URLSearchParams(sy.split('?')[1]);
    expect(query.get('mode')).toBe('article');
    expect(query.get('crop')).toBe('西红柿');
    expect(query.has('plan')).toBe(false);
    const dd = primaryNavigationTarget('reports', { pathname: '/cities/dandong/decision', search: '' }, context);
    expect(dd.split('?')[0]).toBe('/cities/dandong/research/A7');
    expect(new URLSearchParams(dd.split('?')[1]).has('research')).toBe(false);
    expect(primaryNavigationTarget('reports', { pathname: '/cities/tieling/decision', search: '' }, context).split('?')[0]).toBe('/cities/tieling');
  });

  it('根工作台query定位保留；决策模块不会覆盖上次报告位置', () => {
    rememberReportLocation({ pathname: '/cities/shenyang', search: '?research=A3.9&mode=article' });
    rememberReportLocation({ pathname: '/cities/shenyang/decision', search: '?view=compare' });
    const target = primaryNavigationTarget('reports', { pathname: '/decision', search: '' }, context);
    const query = new URLSearchParams(target.split('?')[1]);
    expect(query.get('research')).toBe('A3.9');
    expect(query.get('mode')).toBe('article');
    expect(query.has('view')).toBe(false);
  });

  it('非法城市和外部报告定位不能成为正式导航目标', () => {
    useAppContext.setState(context);
    expect(primaryNavigationTarget('decision', { pathname: '/cities/unknown', search: '' })).toBe('/decision');
    window.sessionStorage.setItem('agriscope.report-locations.v4-final', JSON.stringify({ shenyang: 'https://example.org', dandong: '/cities/shenyang/research/A2' }));
    expect(primaryNavigationTarget('reports', { pathname: '/cities/shenyang/decision', search: '' }).split('?')[0]).toBe('/cities/shenyang');
  });
});
