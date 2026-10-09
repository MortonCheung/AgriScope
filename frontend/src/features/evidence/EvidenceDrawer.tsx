import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { getCity } from '../../domain/geography/cities';
import type { LayerState } from './useEvidenceLayers';
import { useEvidenceLayers } from './useEvidenceLayers';
import './evidence.css';

/**
 * Evidence Drawer 的**接口契约**（Frontend V3 §15）。
 *
 * 契约先于实现：决策中心的「为什么？」只依赖下面这三个 prop，
 * Drawer 内部如何组织证据由 `features/evidence/**` 自己负责。
 * 这样决策中心与证据层可以各自演进，不需要互相耦合实现细节。
 */
export interface EvidenceContext {
  /** 当前全局上下文（与 ContextBar 一致）。 */
  cityId: string;
  crop?: string;
  horizon?: number;
  /** 触发来源，用于让 Drawer 选对证据层级（例如 'forecast' | 'risk' | 'compare' | 'long-horizon'）。 */
  topic?: string;
}

export interface EvidenceDrawerProps {
  open: boolean;
  onClose: () => void;
  context: EvidenceContext;
}

const decimal = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const num = (value: number | null, unit = ''): string => (value === null || !Number.isFinite(value) ? '—' : `${decimal.format(value)}${unit}`);
/** 研究表里的季节幅度按 3 位小数呈现；非数值原样保留（不重算、不改写）。 */
const formatSeasonal = (value: string): string => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== '' ? parsed.toFixed(3) : value;
};

/**
 * 推入式证据抽屉：主页面不离开、不跳路由。
 * `Escape` 关闭；`role=dialog` + `aria-modal`；点背景关闭但点内容不关（防误触）。
 * 七层证据每层只在有真实来源时渲染，取不到就写明「该层暂无可用来源」。
 */
export function EvidenceDrawer({ open, onClose, context }: EvidenceDrawerProps) {
  if (!open) return null;
  return createPortal(<EvidencePanel context={context} onClose={onClose} />, document.body);
}

function EvidencePanel({ context, onClose }: { context: EvidenceContext; onClose: () => void }) {
  const layers = useEvidenceLayers(context);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  const city = getCity(context.cityId);
  const title = [
    city?.shortName ?? context.cityId,
    context.crop ?? '全部品种',
    context.horizon ? `${context.horizon} 天` : null,
  ].filter(Boolean).join(' · ');
  const research = layers.research;

  return (
    <div className="evidence-backdrop" data-testid="evidence-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside
        className="evidence-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-drawer-title"
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="evidence-drawer__head">
          <div>
            <p className="ag-label">这份结论依据什么</p>
            <h2 className="ag-title" id="evidence-drawer-title">{title}</h2>
          </div>
          <button type="button" className="evidence-drawer__close" aria-label="关闭证据面板" onClick={onClose}>×</button>
        </header>

        <div className="evidence-drawer__body">
          <Layer index={1} title="当前市场状态" state={layers.market}>
            {(data) => (
              <>
                <p className="evidence-meta">
                  最新数据日期 {data.latestDataDate ?? '暂无'} · 快照 {data.generatedAt}
                </p>
                <ul className="evidence-rows">
                  {data.crops.slice(0, context.crop ? 1 : 3).map((crop) => (
                    <li key={crop.crop}>
                      <span className="evidence-rows__name">{crop.crop}</span>
                      <span>{crop.pricePerKg === null ? '价格待补充' : `${num(crop.pricePerKg)} 元/kg`}</span>
                      <span className="evidence-rows__signal">信号 {signalText(crop.signal)} · HRI {num(crop.hri)} · 市场风险 {num(crop.marketRisk)}</span>
                      <span className="evidence-rows__muted">30 日变化 {crop.change30d === null ? '—' : percent.format(crop.change30d)}</span>
                    </li>
                  ))}
                </ul>
                <p className="evidence-note">官方批发观测；信号是发布时的模型评估，不是种植建议。</p>
              </>
            )}
          </Layer>

          <Layer index={2} title="历史季节结构" state={layers.seasonal}>
            {(data) => (
              <>
                <p className="evidence-reading">{data.label}：{formatSeasonal(data.value)}</p>
                <p className="evidence-note">来源：{data.source}（产品研究导出表，未重算）。</p>
              </>
            )}
          </Layer>

          <Layer index={3} title="模型结果" state={layers.model}>
            {(data) => (
              <>
                <p className="evidence-reading">
                  点估计 {num(data.point, ' 元/kg')}（区间 {num(data.low)} — {num(data.high)} 元/kg）· 评估跨度 {data.horizon} 天
                </p>
                <p className="evidence-note">
                  {data.semantics === 'historical_seasonal_scenario' ? '历史同月口径' : '模型情景区间'}{data.calibrated ? '，模型标记为已校准' : '，未校准为概率区间'}。
                </p>
                <dl className="evidence-facts">
                  <div><dt>模型版本</dt><dd>{data.modelVersion}</dd></div>
                  <div><dt>数据版本</dt><dd>{data.dataVersion}</dd></div>
                  <div><dt>数据基准日</dt><dd>{data.asOf ?? '—'}</dd></div>
                  <div><dt>更新时间</dt><dd>{data.generatedAt ?? '该指标暂无可用来源'}</dd></div>
                  <div><dt>WAPE</dt><dd>{data.wape === null ? '该指标暂无可用来源（接口未返回，不用其它近似指标替代）' : num(data.wape)}</dd></div>
                </dl>
                <p className="evidence-note">来源：/api/decision 正式模型返回。</p>
              </>
            )}
          </Layer>

          <Layer index={4} title="天气因素" state={layers.weather}>
            {(data) => (
              <>
                <p className="evidence-reading">{data.title}（{data.moduleId}）</p>
                <p className="evidence-quote">{data.summary}</p>
                <p className="evidence-note">
                  研究侧表明：天气与价格的关系不稳定，多数检验没有证据。本层只转述研究结论，不把天气渲染成涨价成因——天气不直接决定价格。
                </p>
              </>
            )}
          </Layer>

          <Layer index={5} title="区域市场" state={layers.regional}>
            {(data) => (
              <>
                <p className="evidence-reading">
                  {data.crop ? `${data.crop} 已发布批发观测：${num(data.price, ' 元/kg')}` : '已发布批发观测（未指定品种）'}
                </p>
                <ul className="evidence-rows evidence-rows--stack">
                  {data.markets.map((market) => (
                    <li key={market.url}><a href={market.url} target="_blank" rel="noreferrer">{market.name} ↗</a></li>
                  ))}
                </ul>
                <p className="evidence-note">未纳入完整物流成本、渠道约束，不构成最优销售路径推荐。</p>
              </>
            )}
          </Layer>

          <Layer index={6} title="数据充分度" state={layers.sufficiency}>
            {(data) => (
              <dl className="evidence-facts">
                {data.rows.map((row) => (
                  <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
                ))}
              </dl>
            )}
          </Layer>

          <Layer index={7} title="研究依据" state={layers.research}>
            {(data) => (
              <ul className="evidence-rows evidence-rows--stack">
                {data.modules.map((module) => (
                  <li key={module.id}><span className="evidence-rows__id">{module.id}</span>{module.title}</li>
                ))}
              </ul>
            )}
          </Layer>
        </div>

        <footer className="evidence-drawer__foot">
          {research.status === 'ready' && research.data.entry ? (
            <Link className="evidence-drawer__entry" to={research.data.entry.href} onClick={onClose}>
              查看完整研究 → {research.data.entry.label}
            </Link>
          ) : (
            <p className="evidence-note">该城暂无可进入的完整研究模块。</p>
          )}
        </footer>
      </aside>
    </div>
  );
}

function signalText(signal: string | null): string {
  return { NORMAL: '常态', WATCH: '留意', HIGH: '偏高', VERY_HIGH: '高度关注', UNKNOWN: '待评估' }[signal ?? 'UNKNOWN'] ?? '待评估';
}

function Layer<T>({ index, title, state, children }: {
  index: number;
  title: string;
  state: LayerState<T>;
  children: (data: T) => React.ReactNode;
}) {
  const headingId = `evidence-layer-${index}`;
  return (
    <section className="evidence-layer" aria-labelledby={headingId}>
      <h3 className="evidence-layer__title" id={headingId}><span>{index}</span>{title}</h3>
      {state.status === 'loading' && <p className="evidence-note" role="status">读取中…</p>}
      {state.status === 'ready' && children(state.data)}
      {(state.status === 'missing' || state.status === 'error') && (
        <p className="evidence-note">该层暂无可用来源。{state.note}</p>
      )}
    </section>
  );
}