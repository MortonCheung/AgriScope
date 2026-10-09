import { ROUTES } from '../../app/routes';

/**
 * 演示导览模式（规范 §42）的步骤定义。
 *
 * 定位（重要）：老师口中的「数字人讲解」不是 AI 助手，而是**演示导览**：
 * 按固定顺序自动导航 + 旁白 + 聚焦高亮，把已经存在的产品内容串成一条讲解线。
 * 没有正式数字人资源时，先实现这个 Guided Presentation Mode，不为数字人阻塞核心产品。
 *
 * 诚实红线（本文件是内容来源，逐条约束在这里）：
 *   - 旁白只复述产品里**已经存在**的页面标题、真实状态与研究模块名；
 *   - 不编造数字、结论、推荐；不出现「准确率」；不声称 LLM / 数字人可以上线；
 *   - `to` 只能是正式路由（见 `app/routes.ts`），`anchor` 只指向真实渲染出来的选择器；
 *   - 目标在真实页面不存在时就删掉这一步，不造一个假步骤。
 *
 * 为什么旁白写在数据里而不是组件里：这是产品内容事实，必须能被测试锁住，
 * 与「模型可信边界」一样属于不能随手改的契约。
 */
export interface PresentationStep {
  /** 稳定 id：用于「同一步只导航一次」与测试。 */
  id: string;
  /** 面板里的步骤短标题。 */
  label: string;
  /** 目标路由（可含查询串），必须是正式路由。 */
  to: string;
  /** 目标锚点的 CSS 选择器；找不到就只导航、不高亮（不编造）。 */
  anchor?: string;
  /** 旁白文本：只复述产品已有内容。 */
  narration: string;
  /** 旁白来源说明：让演示者知道这话从哪来（真实页面 / 研究模块）。 */
  source: string;
}

export const PRESENTATION_STEPS: readonly PresentationStep[] = [
  {
    id: 'province',
    label: '辽宁农业态势',
    to: ROUTES.liaoning,
    anchor: '.liaoning-page__title',
    narration: '地图是全域入口。六城中目前只有沈阳发布日度市场快照，其余城市按研究侧能力如实标注可用性。',
    source: '辽宁农业态势页首说明',
  },
  {
    id: 'chaoyang',
    label: '朝阳 · 城市研究空间',
    to: ROUTES.city('chaoyang'),
    anchor: '.city-research__city',
    narration: '朝阳以模块为单位呈现研究，逐模块给出方法与局限；六个研究城市里，除沈阳是策展树外，其余都采用这种模块级工作台。',
    source: '城市研究空间（模块级工作台）',
  },
  {
    id: 'seasonality',
    label: '市场时间结构与季节性',
    to: ROUTES.research('shenyang', 'A1'),
    anchor: '.research__title',
    narration: '方向 A1 研究沈阳主要蔬菜批发市场的时间结构与季节性，下面挂着若干研究点，例如月份×价格、季节×价格。',
    source: '研究目录 A1「市场时间结构与季节性」',
  },
  {
    id: 'decision',
    label: '决策中心',
    to: ROUTES.decision('shenyang'),
    anchor: '.center-hero',
    narration: '决策中心给出当前判断、7/14/30 天短期预测与长期上市窗口场景；判断句由固定模板拼装，不调用在线 LLM。',
    source: '决策中心页（DecisionCenter）',
  },
  {
    id: 'short-term',
    label: '短期预测 · 7 / 14 / 30',
    to: ROUTES.decision('shenyang'),
    anchor: '.center-horizon-tabs',
    narration: '短期预测给出 7 / 14 / 30 天三个档位；切换档位只更新这一区块的图表与读数，不重载整页，区间与中心值都来自对应跨度的真实模型输出。',
    source: '决策中心 §11 短期预测（7 / 14 / 30）',
  },
  {
    id: 'accumulation',
    label: '14 日累积暴露',
    to: ROUTES.research('shenyang', 'A3.8'),
    anchor: '.research__title',
    narration: '研究点 A3.8「14日累计降水 × 市场」属于方向 A3「滞后、累积与非线性」，并排比较 1/3/7/14 日累积暴露的估计值。',
    source: '研究点 A3.8（方向 A3）',
  },
  {
    id: 'why',
    label: '为什么 · 证据抽屉',
    to: ROUTES.decision('shenyang'),
    anchor: '.center-ops .ag-button--primary',
    narration: '点「为什么？」会打开证据抽屉：它分层列出当前市场状态、历史季节结构、模型结果、天气因素、区域市场、数据充分度与研究依据，取不到来源的层如实写明。',
    source: '决策中心的证据抽屉（EvidenceDrawer 七层）',
  },
  {
    id: 'evidence',
    label: '研究中心 · 证据链',
    to: ROUTES.researchCenter,
    anchor: '.research-center__flow',
    narration: '研究中心把判断拆成 数据 → 分析 → 模型 → 验证 → 决策 五步证据链；某座城市能否进入，以已发布的研究索引为准。',
    source: '研究中心首页（证据链五步）',
  },
  {
    id: 'cross-city',
    label: '辽宁六城比较',
    to: `${ROUTES.researchCenter}?view=cross_city`,
    anchor: '.cx-redline',
    narration: '跨城专用页在统一方法下比较六城的生产结构与市场同步性。六城价格口径不同，只做结构化与相对化比较，不提供六城菜价排行。',
    source: '辽宁六城比较跨城专用页（A10）',
  },
  {
    id: 'synthesis',
    label: '六城综合研究',
    to: `${ROUTES.researchCenter}?view=synthesis`,
    anchor: '.cx-findings',
    narration: '六城综合研究专题汇总辽宁六城农业市场的周期、气象响应与区域差异：先给摘要与关键发现，再给研究总览图与一张总表。',
    source: '六城综合研究专题（A11，SynthesisPage）',
  },
] as const;

const LAST_STEP_INDEX = PRESENTATION_STEPS.length - 1;

/** 把任意索引夹到合法步骤范围内。 */
export function clampStep(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), LAST_STEP_INDEX);
}

/**
 * 每一步的自动前进停留时长（毫秒）。
 *
 * 不是动画，而是给演示者读完旁白的时间：按字数给足，并设下限。
 * 暂停时这个计时被取消（见组件）。
 */
export function stepDwellMs(step: PresentationStep): number {
  return Math.max(6500, step.narration.length * 260);
}