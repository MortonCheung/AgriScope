import { describe, expect, it } from 'vitest';
import { PRESENTATION_STEPS, clampStep, stepDwellMs, type PresentationStep } from './steps';

/**
 * 演示导览步骤契约（规范 §42）。
 *
 * 守两件事：
 *   1. 每一步都指向**真实存在的正式路由**（不造不存在的页面）；
 *   2. 旁白只复述产品已有内容 —— 不含「准确率」等红线字样，也不含禁止出现在界面上的词。
 */

/** 正式路由（与 app/routes.ts 一一对应）。 */
const REAL_ROUTE = [
  /^\/liaoning$/,
  /^\/cities\/[^/]+$/,
  /^\/cities\/[^/]+\/research\/[^/]+$/,
  /^\/cities\/[^/]+\/decision$/,
  /^\/research$/,
];

/** dist 门禁里零容忍、且不该出现在旁白里的界面字样。 */
const FORBIDDEN_IN_NARRATION = ['准确率', '正在读取', '本页面', '本模块', '预测准确'];

function pathOf(step: PresentationStep): string {
  return step.to.split(/[?#]/, 1)[0];
}

describe('演示导览步骤', () => {
  it('至少 3 步，覆盖辽宁 → 城市 → 研究 → 决策 → 研究中心', () => {
    expect(PRESENTATION_STEPS.length).toBeGreaterThanOrEqual(3);
    const ids = PRESENTATION_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['province', 'chaoyang', 'decision', 'evidence']) {
      expect(ids).toContain(id);
    }
  });

  it('每一步的 to 都是正式路由', () => {
    for (const step of PRESENTATION_STEPS) {
      expect(REAL_ROUTE.some((pattern) => pattern.test(pathOf(step))), `${step.id} → ${step.to}`).toBe(true);
    }
  });

  it('每一步都有旁白与来源，锚点（若有）是 CSS 选择器', () => {
    for (const step of PRESENTATION_STEPS) {
      expect(step.label.trim().length).toBeGreaterThan(0);
      expect(step.narration.trim().length).toBeGreaterThan(0);
      expect(step.source.trim().length).toBeGreaterThan(0);
      if (step.anchor) expect(step.anchor.startsWith('.')).toBe(true);
    }
  });

  it('旁白不含红线字样，也不编造数字或结论', () => {
    for (const step of PRESENTATION_STEPS) {
      for (const word of FORBIDDEN_IN_NARRATION) {
        expect(step.narration.includes(word), `${step.id} 含「${word}」`).toBe(false);
      }
    }
  });

  it('clampStep 夹到合法范围，stepDwellMs 有下限', () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(999)).toBe(PRESENTATION_STEPS.length - 1);
    expect(clampStep(Number.NaN)).toBe(0);
    for (const step of PRESENTATION_STEPS) expect(stepDwellMs(step)).toBeGreaterThanOrEqual(6500);
  });
});