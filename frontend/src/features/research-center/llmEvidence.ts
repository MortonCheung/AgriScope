import { useEffect, useState } from 'react';

/**
 * LLM 回溯评估证据（研究中心证据层，V3 §29）。
 *
 * 数据源只有一个：后端只读端点 `GET /api/research/llm-evaluation`。
 * 该端点由**评估侧真实产物**派生（`llm/artifacts/v2/*`）；产物缺失时返回 503。
 * 前端这里不做任何数值推算、不做占位补齐：端点给什么就展示什么。
 * 结论标签、增益、WAPE 全部来自端点，**不在前端写死**。
 */

export interface LlmOutcomeLabels {
  llm: string;
  hybrid: string;
  llm_blind_gain_pp: number;
  llm_context_gain_pp: number;
  llm_residual_gain_pp: number;
  hybrid_best_gain_pp: number;
  note?: string;
}

export interface LlmFairVariant {
  variant: string;
  mean_wape: number | null;
  n: number;
  gain_pp_vs_baseline: number | null;
}

export interface LlmFairComparison {
  metric: string;
  aggregation: string;
  rows: number;
  variants: LlmFairVariant[];
  note: string;
}

export interface LlmIndependentValidation {
  status: string;
  not_before: string;
  untouched_period: unknown;
}

export interface LlmEvaluation {
  status: string;
  evidence_status: string;
  outcome_labels: LlmOutcomeLabels;
  fair_comparison: LlmFairComparison;
  provider: { provider: string | null; model: string | null; is_real_llm: boolean | null };
  final_effective_n: number | null;
  untouched_period: unknown;
  production_eligible: boolean;
  independent_validation: LlmIndependentValidation;
  artifacts_found: string[];
}

export type LlmEvidenceState =
  | { status: 'loading' }
  | { status: 'ready'; data: LlmEvaluation }
  | { status: 'error'; message: string };

/** 读取一个返回 JSON 的只读研究端点，失败时只暴露「哪一类资源没取到」，不带 URL。 */
export async function fetchLlmEvaluation(): Promise<LlmEvaluation> {
  const response = await fetch('/api/research/llm-evaluation');
  if (!response.ok) {
    const error = new Error(`LLM 评估证据读取失败（HTTP ${response.status}）`);
    error.name = 'LlmEvidenceError';
    throw error;
  }
  return (await response.json()) as LlmEvaluation;
}

export function useLlmEvaluation(): LlmEvidenceState {
  const [state, setState] = useState<LlmEvidenceState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    fetchLlmEvaluation().then(
      (data) => { if (alive) setState({ status: 'ready', data }); },
      (error: unknown) => {
        if (!alive) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : 'LLM 评估证据读取失败' });
      },
    );
    return () => { alive = false; };
  }, []);
  return state;
}

/** 变体展示名：只做枚举到中文的查表，不引入任何新结论。 */
export const VARIANT_LABELS: Record<string, string> = {
  baseline: '基线',
  statistical_seasonal: '统计季节',
  llm_blind: 'LLM 盲测',
  llm_context: 'LLM 上下文',
  llm_residual: 'LLM 残差',
  hybrid_A: '混合 A',
  hybrid_B: '混合 B',
  hybrid_C: '混合 C',
};