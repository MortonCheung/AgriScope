import { create } from 'zustand';

/**
 * 研究解读的页面上下文。
 * 图表把用户当前选择写进来，解读组件只读取，不反推、不猜测。
 * 以后接入 LLM 时，这份上下文就是提示词的一部分。
 */
export interface ResearchPageContext {
  cityId: string | null;
  cityName: string | null;
  researchPointId: string | null;
  selectedCrop: string | null;
  selectedVariable: string | null;
  selectedDateRangeOrWindow: string | null;
  currentFigure: string | null;
  evidenceLevel: string | null;
}

const EMPTY: ResearchPageContext = {
  cityId: null,
  cityName: null,
  researchPointId: null,
  selectedCrop: null,
  selectedVariable: null,
  selectedDateRangeOrWindow: null,
  currentFigure: null,
  evidenceLevel: null,
};

interface ResearchContextState extends ResearchPageContext {
  setPoint: (value: Pick<ResearchPageContext, 'cityId' | 'cityName' | 'researchPointId' | 'evidenceLevel'>) => void;
  setSelection: (value: Partial<Pick<ResearchPageContext, 'selectedCrop' | 'selectedVariable' | 'selectedDateRangeOrWindow' | 'currentFigure'>>) => void;
  reset: () => void;
}

export const useResearchContextStore = create<ResearchContextState>((set) => ({
  ...EMPTY,
  setPoint: (value) => set((state) => {
    if (state.researchPointId === value.researchPointId) return state;
    return { ...state, ...value, selectedCrop: null, selectedVariable: null, currentFigure: null };
  }),
  setSelection: (value) => set((state) => ({ ...state, ...value })),
  reset: () => set(EMPTY),
}));
