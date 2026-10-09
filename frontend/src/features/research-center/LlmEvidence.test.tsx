// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmEvidenceSection } from './LlmEvidenceSection';
import type { LlmEvaluation } from './llmEvidence';

/** 与后端 `/api/research/llm-evaluation` 真实形状一致的测试载荷（数值取自真实产物）。 */
function evaluationFixture(): LlmEvaluation {
  return {
    status: 'REAL_LLM_EVALUATED_RETROSPECTIVE_ONLY',
    evidence_status: 'RETROSPECTIVE_ONLY_NO_UNTOUCHED',
    outcome_labels: {
      llm: 'LLM_RETROSPECTIVE_GAIN_OBSERVED',
      hybrid: 'HYBRID_NO_GAIN_STATISTICAL_FALLBACK_ACTIVE',
      llm_blind_gain_pp: -4.712559,
      llm_context_gain_pp: 4.621075,
      llm_residual_gain_pp: -4.211579,
      hybrid_best_gain_pp: 0.0,
      note: 'RETROSPECTIVE_ONLY_NO_UNTOUCHED; research evidence only, never production-admissible',
    },
    fair_comparison: {
      metric: 'WAPE',
      aggregation: 'unweighted mean over fair_comparison.csv rows (variant cell non-empty)',
      rows: 96,
      variants: [
        { variant: 'baseline', mean_wape: 16.5536, n: 96, gain_pp_vs_baseline: 0.0 },
        { variant: 'llm_blind', mean_wape: 21.2662, n: 96, gain_pp_vs_baseline: -4.7126 },
        { variant: 'llm_context', mean_wape: 11.9325, n: 96, gain_pp_vs_baseline: 4.6211 },
      ],
      note: 'reused retrospective pilot; RESEARCH_ONLY; not production-admissible',
    },
    provider: { provider: 'openai_compatible', model: 'deepseek-flash', is_real_llm: true },
    final_effective_n: 0,
    untouched_period: null,
    production_eligible: false,
    independent_validation: {
      status: 'PROSPECTIVE_VALIDATION_PENDING_BY_TIME',
      not_before: '2026-10-08',
      untouched_period: null,
    },
    artifacts_found: [
      'llm/artifacts/v2/real_evaluation_status.json',
      'llm/artifacts/v2/outcome_labels.json',
      'llm/artifacts/v2/fair_comparison.csv',
    ],
  };
}

function stubFetch(body: unknown, ok = true, status = 200) {
  const response = { ok, status, json: async () => body } as Response;
  return vi.stubGlobal('fetch', vi.fn(async () => response));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('LLM evidence section', () => {
  it('renders the four required facts with numbers taken from the endpoint', async () => {
    stubFetch(evaluationFixture());
    render(<LlmEvidenceSection />);

    expect(await screen.findByText('盲测 LLM 为什么没有增益')).toBeTruthy();
    expect(screen.getAllByText('-4.71pp').length).toBeGreaterThan(0);
    expect(screen.getByText('上下文 LLM 为什么回溯有增益')).toBeTruthy();
    expect(screen.getAllByText('+4.62pp').length).toBeGreaterThan(0);
    expect(screen.getByText('为什么仍不能上线生产')).toBeTruthy();
    expect(screen.getByText('独立未来验证缺失')).toBeTruthy();
    expect(screen.getByText('2026-10-08 起')).toBeTruthy();
  });

  it('forbids LLM context as a production model and never calls WAPE accuracy', async () => {
    stubFetch(evaluationFixture());
    const { container } = render(<LlmEvidenceSection />);
    expect(await screen.findByText('决策中心禁止使用 LLM Context 作为正式生产模型。')).toBeTruthy();
    expect(container.textContent).not.toContain('准确率');
    expect(container.textContent).not.toContain('可以上线');
  });

  it('shows the sampled fair comparison rows from the endpoint', async () => {
    stubFetch(evaluationFixture());
    render(<LlmEvidenceSection />);
    const table = await screen.findByLabelText('LLM 与混合变体公平对比');
    expect(table.textContent).toContain('基线');
    expect(table.textContent).toContain('LLM 上下文');
    expect(table.textContent).toContain('+4.62pp');
    expect(table.textContent).toContain('96');
  });

  it('surfaces the 503 failure honestly instead of placeholder data', async () => {
    stubFetch({ error_code: 'RESEARCH_UNAVAILABLE' }, false, 503);
    render(<LlmEvidenceSection />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/HTTP 503/)).toBeTruthy());
  });
});