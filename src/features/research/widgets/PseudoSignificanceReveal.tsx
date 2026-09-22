import { useMemo, useState } from 'react';
import { AsyncBoundary } from '../../../components/AsyncState';
import { DATA_COLORS } from '../../../design/chartTokens';
import type { EvidenceLevelCode, ResearchKeyNumber } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTable } from '../data/useTable';
import { ChartFrame } from './primitives';

interface LayerStat {
  exposure: string;
  label: string;
  sigCount: number;
  tested: number;
  maxAbsEffect: number | null;
  ar1: string | null;
  nEff: string | null;
  bandwidthNote: string | null;
}

function layerOrder(exposure: string): number {
  const match = /\d+/.exec(exposure);
  return match ? Number(match[0]) : 999;
}

/** 统一空白与全角括号；保留半角括号，否则 "AR(1)" 这类后缀会被破坏。 */
function normalize(value: string): string {
  return value.replace(/\s+/g, '').replace(/[（）]/g, '');
}

/**
 * 在研究索引已登记的 key_numbers 中找到该层对应的记录。
 * AR(1) / n_eff 是标签后缀，带宽复核写在数值里（“…… → ……，伪显著”），
 * 两种情况分开判定，避免把诊断值错配到别的层。
 */
function findLayerEntry(
  keyNumbers: ResearchKeyNumber[],
  layerLabel: string,
  predicate: (rawLabel: string, value: string) => boolean,
): string | null {
  const layer = normalize(layerLabel);
  for (const entry of keyNumbers) {
    const value = String(entry.value);
    if (!predicate(entry.label, value)) continue;
    const base = normalize(entry.label).replace(/(AR\(1\)|n_eff)$/, '');
    if (base && (layer.includes(base) || base.includes(layer))) return value;
  }
  return null;
}

/**
 * G4/G5 的伪显著动态揭示。
 *
 * 这是一次研究方法展示，不只是结论：先看到"显著"，再检查自相关，
 * 最后看到带宽放大后显著全部消失。所有计数来自研究表，
 * AR(1)/n_eff 与带宽结论取研究索引已登记的值；未登记的层如实标注。
 */
export function PseudoSignificanceReveal({ summarySource, response, keyNumbers, evidenceLevel }: {
  summarySource: string;
  response: 'price' | 'volume';
  keyNumbers: ResearchKeyNumber[];
  evidenceLevel: EvidenceLevelCode;
}) {
  const state = useTable(summarySource);
  const [step, setStep] = useState(1);

  const layers = useMemo<LayerStat[]>(() => {
    if (state.status !== 'ready') return [];
    const rows = state.data.rows.filter((row) => row.response === response);
    const byExposure = new Map<string, LayerStat>();
    for (const row of rows) {
      const key = row.exposure;
      if (!byExposure.has(key)) {
        byExposure.set(key, {
          exposure: key,
          label: row.label ?? key,
          sigCount: 0,
          tested: 0,
          maxAbsEffect: null,
          ar1: null,
          nEff: null,
          bandwidthNote: null,
        });
      }
      const stat = byExposure.get(key)!;
      stat.tested += 1;
      const fdr = numeric(row.peak_fdr_p);
      if (fdr !== null && fdr < 0.05) stat.sigCount += 1;
      const effect = numeric(row.max_abs_effect);
      if (effect !== null && (stat.maxAbsEffect === null || effect > stat.maxAbsEffect)) stat.maxAbsEffect = effect;
    }
    return [...byExposure.values()]
      .map((stat) => ({
        ...stat,
        ar1: findLayerEntry(keyNumbers, stat.label, (key) => key.includes('AR(1)')),
        nEff: findLayerEntry(keyNumbers, stat.label, (key) => key.includes('n_eff')),
        bandwidthNote: findLayerEntry(keyNumbers, stat.label, (_key, value) => value.includes('→')),
      }))
      .sort((left, right) => layerOrder(left.exposure) - layerOrder(right.exposure));
  }, [keyNumbers, response, state]);

  const steps = [
    { id: 1, title: '初始观察', caption: '按 HAC-14 的 FDR 结果直接看，深层土壤像是"有发现"。' },
    { id: 2, title: '检查自相关', caption: '暴露越慢变，有效样本量越小，常规显著性检验越不可靠。' },
    { id: 3, title: '带宽放大复核', caption: '把 HAC 带宽从 14 放大到 30/60/90，看"显著"是否存活。' },
    { id: 4, title: '重新评估', caption: '综合前三步，判断这是发现还是伪显著。' },
  ] as const;

  return (
    <ChartFrame
      title="深层土壤的伪显著诊断"
      note="按步骤推进：先看到显著性，再检查序列自相关，最后看带宽放大后的结果。"
      provenance="observed"
      sources={[summarySource.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <div className="selector">
          <span className="selector__label">诊断步骤</span>
          <div className="selector__options">
            <button type="button" className="ag-chip" onClick={() => setStep(1)} disabled={step === 1}>重置</button>
            <button type="button" className="ag-chip" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={step === 1}>上一步</button>
            <button type="button" className="ag-chip" onClick={() => setStep((value) => Math.min(steps.length, value + 1))} disabled={step === steps.length}>下一步</button>
          </div>
        </div>
      }
    >
      <AsyncBoundary state={state}>
        {() => (layers.length > 0 ? (
          <>
            <ol className="reveal-steps">
              <li className="reveal-steps__item" data-state={step >= 1 ? 'done' : 'pending'}>
                <header className="reveal-steps__head">
                  <span className="reveal-steps__index">01</span>
                  <h4>{steps[0].title}</h4>
                </header>
                <p className="reveal-steps__caption">{steps[0].caption}</p>
                <ul className="layer-list">
                  {layers.map((layer) => (
                    <li key={layer.exposure}>
                      <span className="layer-list__name">{layer.label}</span>
                      <span className="layer-list__value ag-number">
                        {layer.sigCount} / {layer.tested} 品种显著
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="reveal-steps__note">
                  先记住这一步的印象：层数越深，看起来越"显著"。
                </p>
              </li>

              {step >= 2 && (
                <li className="reveal-steps__item" data-state="done">
                  <header className="reveal-steps__head">
                    <span className="reveal-steps__index">02</span>
                    <h4>{steps[1].title}</h4>
                  </header>
                  <p className="reveal-steps__caption">{steps[1].caption}</p>
                  <ul className="layer-list">
                    {layers.map((layer) => (
                      <li key={layer.exposure}>
                        <span className="layer-list__name">{layer.label}</span>
                        <span className="layer-list__value ag-number">
                          {layer.ar1 !== null ? `AR(1) = ${layer.ar1}` : 'AR(1) 未登记'}
                          {layer.nEff !== null ? ` · n_eff ≈ ${layer.nEff}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="reveal-steps__note">
                    AR(1) 与有效样本量取自研究索引已登记的记录；未登记该层时如实标注，不用近似值填补。
                    自相关越接近 1，六年数据携带的独立信息越少。
                  </p>
                </li>
              )}

              {step >= 3 && (
                <li className="reveal-steps__item" data-state="done">
                  <header className="reveal-steps__head">
                    <span className="reveal-steps__index">03</span>
                    <h4>{steps[2].title}</h4>
                  </header>
                  <p className="reveal-steps__caption">{steps[2].caption}</p>
                  <ul className="layer-list">
                    {layers.map((layer) => (
                      <li key={layer.exposure}>
                        <span className="layer-list__name">{layer.label}</span>
                        <span className="layer-list__value ag-number">
                          {layer.bandwidthNote ?? '研究索引未登记带宽复核结果'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              )}

              {step >= 4 && (
                <li className="reveal-steps__item" data-state="done">
                  <header className="reveal-steps__head">
                    <span className="reveal-steps__index">04</span>
                    <h4>{steps[3].title}</h4>
                  </header>
                  <p className="reveal-steps__caption">{steps[3].caption}</p>
                  <p className="reveal-steps__verdict" style={{ borderColor: DATA_COLORS.null }}>
                    判定：慢变序列 + 有限带宽 HAC 的必然假阳性，<strong>伪显著风险高</strong>。
                    这不是"关系很弱"，而是"当前的检验设置无法把这种关系与趋势区分开"。
                  </p>
                  <p className="reveal-steps__note">
                    每一步都使用了研究表中的真实计数与索引中已登记的诊断值；诊断结论来自研究工程，
                    本页只负责把它拆成可以逐步观察的过程。
                  </p>
                </li>
              )}
            </ol>
          </>
        ) : <p className="ag-meta">该研究点没有可用的土壤层汇总表。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
