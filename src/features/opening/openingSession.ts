/**
 * Opening 只完整播放一次（V2 §63/§108）。
 *
 * 标记只存在 session 内：同一次浏览里再次回到首页、或在页面内跳转回来，
 * 都直接显示最终状态，不让用户每次都等一遍编排。
 */
const OPENING_SEEN_KEY = 'agriscope-opening-seen';

export function hasSeenOpening(): boolean {
  try {
    return window.sessionStorage.getItem(OPENING_SEEN_KEY) === '1';
  } catch {
    // 隐私模式下 sessionStorage 可能不可用：按"已看过"处理，宁可少放一次动画。
    return true;
  }
}

export function markOpeningSeen(): void {
  try {
    window.sessionStorage.setItem(OPENING_SEEN_KEY, '1');
  } catch {
    // 忽略：标记失败只意味着下次还会再放一遍，不影响功能。
  }
}
