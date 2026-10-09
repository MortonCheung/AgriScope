import { cityEntry, useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import type { V2CatalogCity, V2CatalogModule } from '../../domain/research/v2/types';

/**
 * 底部四个主题区（规范 §8）：市场趋势 · 生产结构 · 气象 · 异常事件。
 *
 * 内容全部来自真实研究索引 `/api/research/catalog`（研究侧已发布模块），
 * 每个主题映射到固定的研究模块编号，**不重算、不代拟结论**：
 *   · 模块存在 → 展示研究侧状态 + 标题 + 摘要原句；
 *   · 模块状态为 NOT_SUPPORTED（研究侧判定"数据不成立"）→ 照样原样展示，不美化；
 *   · 模块缺失 → 明确写"该主题暂无已发布研究"，不画空图。
 */

interface ThemeSpec {
  id: string;
  label: string;
  note: string;
  primary: string;
  related: string[];
}

const THEMES: readonly ThemeSpec[] = [
  { id: 'market', label: '市场趋势', note: '价格季节结构与量价传导', primary: 'A01', related: ['A06'] },
  { id: 'production', label: '生产结构', note: '区县生产格局与作物结构', primary: 'A07', related: ['A09'] },
  { id: 'weather', label: '气象', note: '气象响应、滞后与区县面板', primary: 'A02', related: ['A03', 'A08'] },
  { id: 'events', label: '异常事件', note: '极端天气事件与市场恢复', primary: 'A04', related: ['A05'] },
];

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: '已通过',
  DRAFT: '草稿',
  NOT_SUPPORTED: '研究侧判定不成立',
  PARTIAL: '部分',
  PENDING: '待完成',
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

function moduleOf(city: V2CatalogCity, moduleId: string): V2CatalogModule | null {
  return city.modules.find((module) => module.module_id === moduleId) ?? null;
}

function ThemeSection({ theme, city }: { theme: ThemeSpec; city: V2CatalogCity | null }) {
  const primary = city ? moduleOf(city, theme.primary) : null;
  const related = city
    ? theme.related
      .map((id) => moduleOf(city, id))
      .filter((module): module is V2CatalogModule => module !== null)
    : [];

  return (
    <section className="province-theme" aria-label={theme.label}>
      <header className="province-theme__head">
        <h3 className="province-theme__title">{theme.label}</h3>
        <p className="ag-caption">{theme.note}</p>
      </header>

      {primary ? (
        <div className="province-theme__body">
          <p className="province-theme__meta">
            <span className="province-theme__status" data-status={primary.status}>
              {primary.module_id} · {statusLabel(primary.status)}
              {related.length > 0 && ` · 另见 ${related.map((module) => `${module.module_id} ${statusLabel(module.status)}`).join('，')}`}
            </span>
            <span className="province-theme__mtitle">{primary.title}</span>
          </p>
          <p className="province-theme__summary">{primary.summary ?? '研究侧未提供摘要。'}</p>
        </div>
      ) : (
        <p className="province-theme__empty">
          {city ? `该主题（${theme.primary}）暂无已发布研究。` : '该城市尚未发布研究载荷。'}
        </p>
      )}
    </section>
  );
}

export function ProvinceThemes({ cityId }: { cityId: string }) {
  const catalogState = useRuntimeCatalog();
  const city = catalogState.status === 'ready' ? cityEntry(catalogState.catalog, cityId) : null;

  return (
    <section className="liaoning-page__themes" aria-label="辽宁农业主题研究">
      <div className="liaoning-page__theme-intro">
        <p className="ag-label">主题研究</p>
        <p className="ag-caption">
          {catalogState.status === 'loading'
            ? '研究索引载入中'
            : catalogState.status === 'error'
              ? `研究索引读取失败：${catalogState.message}`
              : `${cityId === 'shenyang' ? '沈阳' : city?.city_name ?? cityId} · 以下摘要取自研究侧已发布模块，未在态势页重算。`}
        </p>
      </div>

      <div className="liaoning-page__theme-grid">
        {THEMES.map((theme) => (
          <ThemeSection key={theme.id} theme={theme} city={city} />
        ))}
      </div>
    </section>
  );
}