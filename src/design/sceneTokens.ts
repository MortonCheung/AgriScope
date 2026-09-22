/**
 * 三维沙盘配色令牌。
 *
 * Three.js 的材质与灯光需要具体色值，无法直接消费 CSS 变量，
 * 因此这里是暖白体系在场景层的唯一副本；值必须与 `tokens.css` 保持一致。
 * 任何新增场景颜色都应先加到这里，而不是散落在组件里。
 */
export const SCENE_TOKENS = {
  /** 画布底色 = --ag-paper */
  paper: '#f7f5f1',
  /** 纸面承载平面：与画布底色接近但不相同，形成极轻的桌面层次（V3 §41） */
  ground: '#f1eee7',
  /** 高光/主光 = 纯白 */
  lightKey: '#ffffff',
  /** 环境补光 = --ag-paper-deep 一侧的暖灰 */
  lightFill: '#d9d3c8',
  /** 城市实体填充：普通 / 研究城市 / 强调 / 退后 */
  cityFill: {
    base: '#e3ded4',
    study: '#d5cec1',
    focus: '#c3b9a8',
    dim: '#efece5',
  },
  /** 边界线：默认用近黑低透明度，强化时用近黑 */
  outline: 'rgb(26 25 23 / 0.34)',
  outlineStrong: '#1a1917',
} as const;
