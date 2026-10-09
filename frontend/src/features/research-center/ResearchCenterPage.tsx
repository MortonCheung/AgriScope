import { LIAONING_CITIES, STUDY_CITY_IDS } from '../../domain/geography/cities';
import { hasCatalog } from '../../domain/research/catalog';
import { ROUTES } from '../../app/routes';
import { TransitionLink } from '../../app/pageNavigation';
import './research-center.css';

/**
 * 研究中心首页（V3 §17/§18/§47/§19）。
 *
 * 定位：AgriScope 的**证据库**。它回答的不是"有哪些文章"，而是
 * "这个平台凭什么这样判断" —— 数据 → 分析 → 模型 → 验证 → 决策。
 *
 * 诚实原则（§22/§58/§69）：
 *   - 只把**真的能在前端打开**的研究城市做成可进入；
 *   - 研究资产已产出、但前端浏览载荷尚未接入的部分（跨城市 / 综合研究），
 *     如实标注为"待接入"，绝不伪造一个能点进去的空壳。
 *   - 不出现"敬请期待 / Coming soon"式文案。
 */

const studyCities = STUDY_CITY_IDS
  .map((id) => LIAONING_CITIES.find((city) => city.id === id))
  .filter((city): city is NonNullable<typeof city> => Boolean(city));

const FLOW = ['数据', '分析', '模型', '验证', '决策'] as const;

/** 组织级研究资产：已有正式研究代码与数据，但前端浏览载荷尚未发布到 public/。 */
const PENDING_ASSETS = [
  { name: '辽宁六城比较', note: '跨城市生产结构、季节同步与相关性' },
  { name: '六城综合研究', note: '区域差异与市场周期总研究' },
];

export function ResearchCenterPage() {
  const openableCities = studyCities.filter((city) => hasCatalog(city.id));
  const pendingCities = studyCities.filter((city) => !hasCatalog(city.id));

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

          <ul className="research-center__cities">
            {studyCities.map((city) => {
              const available = hasCatalog(city.id);
              return (
                <li key={city.id} className="research-center__city" data-available={available || undefined}>
                  <span className="research-center__city-name">{city.shortName}</span>
                  {available ? (
                    <TransitionLink className="research-center__city-link" to={ROUTES.city(city.id)}>
                      进入研究 →
                    </TransitionLink>
                  ) : (
                    <span className="research-center__city-state">前端浏览载荷待接入</span>
                  )}
                </li>
              );
            })}
          </ul>

          <ul className="research-center__assets">
            {PENDING_ASSETS.map((asset) => (
              <li key={asset.name} className="research-center__asset">
                <span className="research-center__asset-name">{asset.name}</span>
                <span className="research-center__asset-note">{asset.note}</span>
                <span className="research-center__city-state">前端浏览载荷待接入</span>
              </li>
            ))}
          </ul>

          <p className="ag-caption">
            已接入 {openableCities.length} 座城市；另有 {pendingCities.length} 座城市的研究已产出，浏览载荷发布后在此开放。
          </p>
        </section>

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
