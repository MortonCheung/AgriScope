import { useSearchParams } from 'react-router-dom';
import { LIAONING_CITIES, STUDY_CITY_IDS } from '../../domain/geography/cities';
import { hasCatalog } from '../../domain/research/catalog';
import { cityEntry, useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { ROUTES } from '../../app/routes';
import { TransitionLink } from '../../app/pageNavigation';
import { LlmEvidenceSection } from './LlmEvidenceSection';
import { CrossCityPage } from '../cross-city/CrossCityPage';
import { SynthesisPage } from '../cross-city/SynthesisPage';
import './research-center.css';

/**
 * 研究中心首页（Frontend V3 §19–§20）。
 *
 * 定位：AgriScope 的**证据层**。它回答的不是"有哪些文章"，而是
 * "这个平台凭什么这样判断" —— 数据 → 分析 → 模型 → 验证 → 决策。
 *
 * 诚实原则：
 *   - 城市是否可进入，以**已发布的研究索引**（`/api/research/catalog`）为准；
 *   - 索引未就绪时如实显示"六城研究索引载入中"，不预先假定哪座城市可进入；
 *   - 模块数量与标题来自研究侧真实导出，不由前端编造；
 *   - 索引读取失败时明确报错，并说明原因，不用占位内容伪装。
 */

const studyCities = STUDY_CITY_IDS
  .map((id) => LIAONING_CITIES.find((city) => city.id === id))
  .filter((city): city is NonNullable<typeof city> => Boolean(city));

const FLOW = ['数据', '分析', '模型', '验证', '决策'] as const;

export function ResearchCenterPage() {
  const catalogState = useRuntimeCatalog();
  const [searchParams] = useSearchParams();

  /* 跨城专用页与六城综合研究专题没有独立路由（路由层不在本轮可改范围），
     因此用研究中心首页的 `?view=` 承载：入口点进来就地切换到专页组件。 */
  const view = searchParams.get('view');
  if (view === 'cross_city') return <CrossCityPage />;
  if (view === 'synthesis') return <SynthesisPage />;

  const published = catalogState.status === 'ready' ? catalogState.catalog : null;
  const entryOf = (cityId: string) => (published ? cityEntry(published, cityId) : null);
  const crossCity = entryOf('cross_city');
  const openableCount = published ? studyCities.filter((city) => entryOf(city.id)).length : 0;

  return (
    <main className="ag-page">
      <div className="ag-container research-center">
        <header className="ag-section__head">
          <p className="ag-label">研究中心</p>
          <h1 className="ag-hero">AgriScope 如何形成判断</h1>
          <p className="ag-lead">
            平台的每一个结论都可以在这里回溯到它的数据、方法与验证。
            这里不是文章集合，而是决策背后的证据链。
          </p>
        </header>

        <section className="ag-section" aria-label="证据链">
          <ol className="research-center__flow">
            {FLOW.map((step, index) => (
              <li key={step} className="research-center__flow-item">
                <span className="research-center__flow-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="research-center__flow-name">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="ag-section" aria-labelledby="rc-research">
          <div className="ag-section__head">
            <h2 className="ag-section-title" id="rc-research">研究成果</h2>
            <p className="ag-body-secondary">六城研究与跨城市研究，逐条给出问题、方法、数据与局限。</p>
          </div>

          {catalogState.status === 'loading' && (
            <p className="ag-body-secondary" aria-busy="true">六城研究索引载入中</p>
          )}
          {catalogState.status === 'error' && (
            <p className="ag-body" role="alert">
              研究索引读取失败：{catalogState.message}
              <span className="ag-caption">（后端未启动或研究产物未发布时会出现该状态；不展示占位数据。）</span>
            </p>
          )}

          <ul className="research-center__cities">
            {studyCities.map((city) => {
              const entry = entryOf(city.id);
              return (
                <li key={city.id} className="research-center__city" data-available={entry ? true : undefined}>
                  <span className="research-center__city-name">{city.shortName}</span>
                  {entry ? (
                    <>
                      <span className="ag-caption">
                        {entry.n_modules} 个研究模块 · {hasCatalog(city.id) ? '策展树（方向 → 研究点）' : '模块级工作台'}
                      </span>
                      <TransitionLink className="research-center__city-link" to={ROUTES.city(city.id)}>
                        进入研究 →
                      </TransitionLink>
                    </>
                  ) : (
                    <span className="research-center__city-state">
                      {catalogState.status === 'loading' ? '读取中…' : '未发布研究载荷'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <ul className="research-center__assets">
            <li className="research-center__asset">
              <span className="research-center__asset-name">辽宁六城比较（跨城专用页）</span>
              <span className="research-center__asset-note">
                {crossCity ? crossCity.modules.map((module) => module.title).join(' · ') : '跨城市生产结构、季节同步与区域差异'}
              </span>
              {crossCity ? (
                <TransitionLink className="research-center__city-link" to={`${ROUTES.researchCenter}?view=cross_city`}>
                  进入比较 →
                </TransitionLink>
              ) : (
                <span className="research-center__city-state">
                  {catalogState.status === 'loading' ? '读取中…' : '未发布研究载荷'}
                </span>
              )}
            </li>
            <li className="research-center__asset">
              <span className="research-center__asset-name">六城综合研究（专题）</span>
              <span className="research-center__asset-note">辽宁六城农业市场周期、气象响应与区域差异研究</span>
              {crossCity ? (
                <TransitionLink className="research-center__city-link" to={`${ROUTES.researchCenter}?view=synthesis`}>
                  进入专题 →
                </TransitionLink>
              ) : (
                <span className="research-center__city-state">
                  {catalogState.status === 'loading' ? '读取中…' : '未发布研究载荷'}
                </span>
              )}
            </li>
          </ul>

          {published && (
            <p className="ag-caption">
              已发布 {published.n_cities} 个研究目录、{published.n_modules} 个模块；其中 {openableCount} 座研究城市可进入。
              沈阳为策展树，其余为模块级工作台（研究侧仅导出模块与交互元数据时，平台不代其编造研究点）。
            </p>
          )}
        </section>

        <LlmEvidenceSection />

        <section className="ag-section" aria-labelledby="rc-index">
          <div className="ag-section__head">
            <h2 className="ag-section-title" id="rc-index">索引</h2>
          </div>
          <nav className="research-center__index" aria-label="研究中心索引">
            <TransitionLink className="research-center__index-link" to={ROUTES.reports}>
              <span>研究报告</span>
              <span className="ag-caption">六城报告与辽宁综合报告</span>
            </TransitionLink>
            <TransitionLink className="research-center__index-link" to={ROUTES.about}>
              <span>方法与溯源</span>
              <span className="ag-caption">证据等级规范与来源登记</span>
            </TransitionLink>
          </nav>
        </section>
      </div>
    </main>
  );
}