/** One progress drives the camera and all solids; the last solid settles at 0.92. */
export const OPENING_SETTLE_PROGRESS = 0.92;
export const DROP_DELAY_BASE = 0.02;
export const DROP_DELAY_SPAN = 0.2;
export const DROP_SPAN = OPENING_SETTLE_PROGRESS - DROP_DELAY_BASE - DROP_DELAY_SPAN;

export function assemblyProgress(progress: number, delay: number): number {
  return Math.max(0, Math.min(1, (progress - delay) / DROP_SPAN));
}

/** Monotone height decay, without passing below the paper. */
export function assemblyHeight(progress: number, delay: number, startHeight: number): number {
  const t = assemblyProgress(progress, delay);
  return startHeight * (1 - t) ** 3;
}

/** Slight settling tilt, independent of the province's fixed orientation. */
export function assemblyTilt(progress: number, delay: number): number {
  const t = assemblyProgress(progress, delay);
  const back = 1 + 2.15 * (t - 1) ** 3 + 1.15 * (t - 1) ** 2;
  return 2 * Math.PI / 180 * (1 - back);
}
