import { VARIANT_LABELS, useLlmEvaluation } from './llmEvidence';
import type { LlmEvaluation } from './llmEvidence';

/**
 * 研究中心 · LLM 评估证据区块（V3 §29）。
 *
 * 必须回答四件事，且只使用端点返回的真实数值：
 *   1. Blind LLM 为什么没有增益（端点给 llm_blind_gain_pp）；
 *   2. Context LLM 为什么回溯有增益（端点给 llm_context_gain_pp）；
 *   3. 为什么仍不能上线生产（RESEARCH_ONLY / 无 untouched 样本 / final_effective_n=0 / 区间未校准）；
 *   4. 独立未来验证缺失（起点不得早于端点给的 not_before）。
 * 并明确写出：决策中心禁止使用 LLM Context 作为正式生产模型。
 *
 * 诚实边界：不把 context 增益归因为「模型更聪明」（预训练历史知识无法排除）；
 * 不把 WAPE 写成准确率；不宣传可上线。
 */

function formatPp(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}pp`;
}

function formatWape(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

function untouchedText(value: unknown): string {
  return value === null || value === undefined ? 'null' : String(value);
}

export function LlmEvidenceSection() {
  const state = useLlmEvaluation();

  return (
    <section className="ag-section" aria-labelledby="rc-llm">
      <div className="ag-section__head">
        <h2 className="ag-section-title" id="rc-llm">LLM 评估证据</h2>
        <p className="ag-body-secondary">
          真实 LLM 回溯评估的机器可读证据。结论标签、增益与 WAPE 全部逐项取自评估产物，不做改写或推算。
        </p>
      </div>

      {state.status === 'loading' && (
        <p className="ag-body-secondary" aria-busy="true">LLM 评估证据载入中</p>
      )}

      {state.status === 'error' && (
        <p className="ag-body" role="alert">
          LLM 评估证据读取失败：{state.message}
          <span className="ag-caption">（评估产物未生成时后端返回 503，此处如实显示，不展示占位数据。）</span>
        </p>
      )}

      {state.status === 'ready' && <LlmEvidenceBody data={state.data} />}
    </section>
  );
}

function LlmEvidenceBody({ data }: { data: LlmEvaluation }) {
  const labels = data.outcome_labels;
  const invalid = data.independent_validation;
  const variants = data.fair_comparison.variants;

  return (
    <div className="research-center__llm">
      <p className="ag-caption">
        证据状态 {data.evidence_status} · 结论 {data.status} ·
        provider {data.provider.provider ?? '—'} / {data.provider.model ?? '—'}
        （真实调用：{data.provider.is_real_llm ? '是' : '否'}）
      </p>

      <ol className="research-center__llm-facts">
        <li className="research-center__llm-fact">
          <span className="research-center__llm-fact-head">
            盲测 LLM 为什么没有增益
            <span className="research-center__llm-fact-value">{formatPp(labels.llm_blind_gain_pp)}</span>
          </span>
          <span className="research-center__llm-fact-body">
            盲测只看到截止时点前的数值历史，不含其后信息。回溯 WAPE 相对基线为
            {formatPp(labels.llm_blind_gain_pp)}，未观察到增益（结论标签 {labels.llm}）。
          </span>
        </li>

        <li className="research-center__llm-fact">
          <span className="research-center__llm-fact-head">
            上下文 LLM 为什么回溯有增益
            <span className="research-center__llm-fact-value">{formatPp(labels.llm_context_gain_pp)}</span>
          </span>
          <span className="research-center__llm-fact-body">
            上下文方式纳入更多时点信息，回溯 WAPE 相对基线为
            {formatPp(labels.llm_context_gain_pp)}。但该增益不能归因为模型更聪明——
            Context 无法完全排除预训练历史知识，且与盲测必须分开报告。
          </span>
        </li>

        <li className="research-center__llm-fact">
          <span className="research-center__llm-fact-head">
            为什么仍不能上线生产
            <span className="research-center__llm-fact-value">RESEARCH_ONLY</span>
          </span>
          <span className="research-center__llm-fact-body">
            证据状态 {data.evidence_status}：无 untouched 独立样本，final_effective_n={data.final_effective_n}，
            untouched 区间 {untouchedText(data.untouched_period)}；预测区间未校准，仅供研究，数值生产禁用。
            残差式 LLM 为 {formatPp(labels.llm_residual_gain_pp)}；hybrid 最好仅 {formatPp(labels.hybrid_best_gain_pp)}，
            统计回退仍生效（{labels.hybrid}）。
          </span>
        </li>

        <li className="research-center__llm-fact">
          <span className="research-center__llm-fact-head">
            独立未来验证缺失
            <span className="research-center__llm-fact-value">{invalid.not_before} 起</span>
          </span>
          <span className="research-center__llm-fact-body">
            当前没有未见样本。独立验证的起点不得早于 {invalid.not_before}，
            其后成熟标签才可作前瞻评估（{invalid.status}）。
          </span>
        </li>
      </ol>

      <p className="research-center__llm-redline" role="note">
        决策中心禁止使用 LLM Context 作为正式生产模型。
      </p>

      <div className="research-center__llm-fair">
        <h3 className="research-center__llm-subtitle">公平对比（{data.fair_comparison.metric}，越低越好）</h3>
        <p className="ag-caption">
          同一口径下各变体相对基线的表现，逐项取自评估侧公平对比表；
          {data.fair_comparison.rows} 行按 unweighted row mean 汇总，正增益 = 相对基线更好。
        </p>
        <table className="research-center__llm-table" aria-label="LLM 与混合变体公平对比">
          <thead>
            <tr>
              <th scope="col">变体</th>
              <th scope="col">平均 WAPE</th>
              <th scope="col">相对基线增益</th>
              <th scope="col">样本行数</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => (
              <tr key={variant.variant}>
                <th scope="row">{VARIANT_LABELS[variant.variant] ?? variant.variant}</th>
                <td>{formatWape(variant.mean_wape)}</td>
                <td>{variant.gain_pp_vs_baseline === null ? '—' : formatPp(variant.gain_pp_vs_baseline)}</td>
                <td>{variant.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="ag-caption">
        读取到的评估产物：{data.artifacts_found.join('、')}。
      </p>
    </div>
  );
}