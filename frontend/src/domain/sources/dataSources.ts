import { isStudyCity, type StudyCityId } from '../geography/cities';

export type DataSourceScope = StudyCityId | 'liaoning';
export type DataSource = { name: string; url: string };

// Verified publisher/data portals for this scope, not per-card price lineage.
// Regional references retain their real publisher, including cross-city adoption.
const shenyangMarket = { name: '沈阳菜篮子平台', url: 'https://fgw.shenyang.gov.cn/wjgz/clzxxfbpt/' };
const provinceCities = { name: '辽宁分市价格监测', url: 'https://fgw.ln.gov.cn/wjjc/jgjc/ReportGoodsInfoByCity.aspx?PriceBureauMainType_Id=101' };

export const citySources = {
  liaoning: [
    { name: '辽宁省农业农村厅', url: 'https://nync.ln.gov.cn/nync/index/zwgk/zszdgz/ncpxx/lnsnzyscpzjg/index.shtml' },
    { name: '辽宁省价格监测', url: 'https://fgw.ln.gov.cn/fgw/xxgk/jgjc/mrjg/index.shtml' },
  ],
  shenyang: [shenyangMarket, { name: '沈阳市统计局', url: 'https://tjj.shenyang.gov.cn/sjfb/ndsj/' }],
  tieling: [provinceCities, { name: '辽宁省粮油价格', url: 'https://nync.ln.gov.cn/nync/index/zwgk/zszdgz/ncpxx/lnsnzylypzscjg/index.shtml' }],
  chaoyang: [{ name: '朝阳市发改委价格信息', url: 'https://fgw.chaoyang.gov.cn/cysfzhggwyh/zwgk/zwgkzdgz/wjzd/glist.html' }, shenyangMarket],
  jinzhou: [{ name: '锦州菜篮子平台', url: 'https://www.jz.gov.cn/ztzl/clzxxfbpt/fxyc.htm' }, shenyangMarket],
  dandong: [provinceCities, shenyangMarket],
  dalian: [{ name: '大连市农业农村局', url: 'https://agri.dl.gov.cn/col/col4139/index.html' }, provinceCities],
} as const satisfies Record<DataSourceScope, readonly [DataSource, DataSource]>;

export function sourcesForScope(cityId: string | null) {
  const scope: DataSourceScope = cityId && isStudyCity(cityId) ? cityId : 'liaoning';
  return { scope, items: citySources[scope] };
}
