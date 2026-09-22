/**
 * Opening 只完整播放一次，并且**带版本**（V5 §57）。
 *
 * 旧实现写死 `= '1'`，导致动画改了用户也看不到。现在写入的是版本号：
 * 版本一变，所有用户都会自动重看一次新的开场。
 */
const OPENING_SEEN_KEY = 'agriscope-opening-seen';
export const OPENING_VERSION = 'v5-orbit-assembly';

export function hasSeenOpening(): boolean {
  try {
    return window.sessionStorage.getItem(OPENING_SEEN_KEY) === OPENING_VERSION;
  } catch {
    // 隐私模式下 sessionStorage 可能不可用：按"已看过"处理，宁可少放一次动画。
    return true;
  }
}

export function markOpeningSeen(): void {
  try {
    window.sessionStorage.setItem(OPENING_SEEN_KEY, OPENING_VERSION);
  } catch {
    // 忽略：标记失败只意味着下次还会再放一遍，不影响功能。
  }
}
