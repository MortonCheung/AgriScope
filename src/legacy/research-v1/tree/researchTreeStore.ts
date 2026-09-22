import { create } from 'zustand';

/**
 * 研究树状态（V3 §59/§60/§61）。
 *
 * 只保存"用户在研究体系里的位置"，不在页面组件里各存一份 Boolean：
 *   - selectedPointId：当前选中的研究点（打开图表、关闭图表、Back 之后都必须保留）
 *   - closedTopicIds：用户手动收起的专题（默认全部展开；当前专题强制展开，见 ResearchTreeNav）
 *   - treeScrollTop：目录滚动位置，从研究点返回城市时不跳回顶部
 * 换城市时整体重置。
 */
interface ResearchTreeState {
  cityId: string | null;
  selectedPointId: string | null;
  closedTopicIds: string[];
  treeScrollTop: number;
  /** 进入某城市的研究空间时调用；同一城市不会重置。 */
  enterCity: (cityId: string) => void;
  selectPoint: (pointId: string | null) => void;
  toggleTopic: (topicId: string) => void;
  setTreeScrollTop: (scrollTop: number) => void;
}

export const useResearchTreeStore = create<ResearchTreeState>((set) => ({
  cityId: null,
  selectedPointId: null,
  closedTopicIds: [],
  treeScrollTop: 0,
  enterCity: (cityId) => set((state) => (
    state.cityId === cityId
      ? state
      : { cityId, selectedPointId: null, closedTopicIds: [], treeScrollTop: 0 }
  )),
  selectPoint: (selectedPointId) => set({ selectedPointId }),
  toggleTopic: (topicId) => set((state) => ({
    closedTopicIds: state.closedTopicIds.includes(topicId)
      ? state.closedTopicIds.filter((id) => id !== topicId)
      : [...state.closedTopicIds, topicId],
  })),
  setTreeScrollTop: (treeScrollTop) => set({ treeScrollTop }),
}));
