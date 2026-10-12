import { describe, expect, it, vi } from 'vitest';
import { MOTION_DURATION } from './motion';

describe('shared paper and local motion tokens', () => {
  it('keeps CSS and WAAPI durations in agreement', async () => {
    // Vitest replaces CSS modules with stubs; read the production stylesheet itself.
    const { readFileSync } = await vi.importActual<{ readFileSync: (path: URL, encoding: 'utf8') => string }>('node:fs');
    const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
    const pairs = { paperExit: 'paper-exit', paperEnter: 'paper-enter', content: 'content', valueExit: 'value-exit', valueEnter: 'value-enter' } as const;
    for (const [jsName, cssName] of Object.entries(pairs)) {
      const match = new RegExp(`--ag-dur-${cssName}:\\s*([\\d.]+)(ms|s)`).exec(css);
      expect(match, cssName).not.toBeNull();
      const milliseconds = Number(match![1]) * (match![2] === 's' ? 1000 : 1);
      expect(milliseconds).toBeCloseTo(MOTION_DURATION[jsName as keyof typeof pairs] * 1000);
    }
  });
  it('gives geometric page motion more time than local feedback', () => {
    expect(MOTION_DURATION.paperExit).toBeGreaterThanOrEqual(.3);
    expect(MOTION_DURATION.paperExit).toBeLessThanOrEqual(.38);
    expect(MOTION_DURATION.paperEnter).toBeGreaterThanOrEqual(.4);
    expect(MOTION_DURATION.paperEnter).toBeLessThanOrEqual(.55);
    expect(MOTION_DURATION.content).toBeLessThan(MOTION_DURATION.paperExit);
  });
});
