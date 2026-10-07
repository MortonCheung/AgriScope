// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DecisionPage } from './DecisionPage';
import { DecisionStressPage } from './DecisionStressPage';
import { getDecisionProvider } from '../../providers/decision';
import { getDecisionSamples } from '../../providers/decision/fixtures';
import { adaptLegacyFixture, normalizeLegacyRequest, type LegacyFixture } from '../../providers/decision/legacyAdapter';
import raw from '../../../public/decision/legacy-v2/baseline-100.json';
import { MockDecisionProvider } from '../../providers/decision/MockDecisionProvider';

vi.mock('../../providers/decision',()=>({getDecisionProvider:vi.fn()}));
vi.mock('../../providers/decision/fixtures',()=>({getDecisionSamples:vi.fn(),readLegacyFixture:vi.fn()}));
const fixture=raw as LegacyFixture;const request=normalizeLegacyRequest(fixture.request);
const adapted=adaptLegacyFixture(fixture);
let seq=0;
function renderDecision(testState:string){
  const provider=getDecisionProvider();
  vi.mocked(getDecisionProvider).mockReturnValue({...provider,decide:provider.decide.bind(provider),listSamples:()=>getDecisionSamples()});
  return render(<MemoryRouter initialEntries={[`/cities/shenyang/decision?view=input&test_state=${testState}`]}><Routes><Route path="/cities/:cityId/decision" element={<DecisionPage/>}/><Route path="/scenario-lab" element={<DecisionStressPage/>}/></Routes></MemoryRouter>);
}
beforeEach(()=>{
  vi.stubGlobal('matchMedia',()=>({matches:false,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  vi.mocked(getDecisionSamples).mockResolvedValue([{id:'baseline-100',label:'100 亩 · 均衡',request}]);sessionStorage.clear();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function sample(){fireEvent.click(screen.getByText('用历史样例试一下'));await waitFor(()=>expect(screen.queryByRole('button',{name:'100 亩 · 均衡'})).not.toBeNull());fireEvent.click(screen.getByRole('button',{name:'100 亩 · 均衡'}));}
describe('decision flow & truthfulness',()=>{
  it.each([true,false])('preserves model origin and calibrated interval flag (%s) in comparison and stress',async(calibrated)=>{
    const model=structuredClone(adapted);model.data_status='model';
    for(const candidate of model.candidates)for(const range of [candidate.price,candidate.profit,candidate.roi])range.is_calibrated_interval=calibrated;
    vi.mocked(getDecisionProvider).mockReturnValue({decide:async()=>model});renderDecision(`model-${calibrated}-${++seq}`);await sample();
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'芸豆 100 亩'})).not.toBeNull());
    fireEvent.click(screen.getByRole('button',{name:'比较'}));
    expect(screen.getByText(calibrated?/高低区间由模型标记为已校准/:/部分高低情景没有校准为概率区间/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'方案'}));fireEvent.click(screen.getByRole('link',{name:'如果条件变差 →'}));
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'条件变差，还撑得住吗。'})).not.toBeNull());
    expect(screen.getByText('模型结果 · 参考成本可能缺项，请核对完整投入。')).toBeTruthy();
    expect(screen.queryByText('演示情景 · 参考成本可能缺项，请核对完整投入。')).toBeNull();
  });
  it('has blank initial fields and does not submit invalid dates/areas',()=>{
    const decide=vi.fn().mockResolvedValue(adapted);vi.mocked(getDecisionProvider).mockReturnValue({decide});renderDecision(`blank-${++seq}`);
    fireEvent.click(screen.getByRole('button',{name:'比较种植选择 →'}));expect(screen.getByRole('alert').textContent).toContain('面积需要大于');expect(decide).not.toHaveBeenCalled();
  });
  it('shows recommendation confidence, supports detail/compare/evidence and enters stress',async()=>{
    vi.mocked(getDecisionProvider).mockReturnValue({decide:vi.fn().mockResolvedValue(adapted)});renderDecision(`flow-${++seq}`);await sample();
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'芸豆 100 亩'})).not.toBeNull());
    expect(screen.getByText('37.4 / 100')).toBeTruthy();expect(screen.queryByText('82.6 / 100')).toBeNull();expect(screen.getByText('成本可能缺项，收益可能高估。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'收益与风险'}));expect(screen.getByText('历史同月价格范围，未校准为概率区间。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'比较'}));expect(screen.getByRole('combobox',{name:'替代比较方案'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'依据'}));expect(screen.getByRole('link',{name:'月份与价格 →'}).getAttribute('href')).toBe('/cities/shenyang/research/A1.3');
    fireEvent.click(screen.getByRole('button',{name:'方案'}));fireEvent.click(screen.getByRole('link',{name:'如果条件变差 →'}));
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'条件变差，还撑得住吗。'})).not.toBeNull());
    fireEvent.click(await screen.findByRole('button',{name:'市场转弱'}));expect(screen.getByText('旧模型参数压力情景，非发生概率或因果估计。 压力结果的上行情景待补充。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'上市延迟 7 天'}));expect(screen.getByText(/零变化不代表延迟没有风险/)).toBeTruthy();
    fireEvent.click(screen.getByRole('link',{name:'← 返回种植选择'}));await waitFor(()=>expect(screen.queryByRole('heading',{name:'芸豆 100 亩'})).not.toBeNull());
  });
  it.each(['model_error','user_input_required','empty','insufficient_market_data'] as const)('allows correction after %s',async(state)=>{
    // Terminal states are independent of fixture fetches.
    vi.mocked(getDecisionProvider).mockReturnValue(new MockDecisionProvider(state));renderDecision(`state-${state}-${++seq}`);await sample();
    await waitFor(()=>expect(screen.queryByRole('button',{name:'修改条件'})).not.toBeNull());fireEvent.click(screen.getByRole('button',{name:'修改条件'}));expect(screen.getByRole('heading',{name:'这季，怎么种。'})).toBeTruthy();
  });
  it('null reads remain missing in detail, comparison and stress',async()=>{
    const missing=structuredClone(adapted);missing.candidates[0].price.low=null;missing.candidates[0].price.base=null;missing.candidates[0].price.high=null;missing.candidates[0].profit={...missing.candidates[0].profit,low:null,base:null,high:null};missing.candidates[0].roi={...missing.candidates[0].roi,low:null,base:null,high:null};missing.candidates[0].stress_scenarios=[];
    vi.mocked(getDecisionProvider).mockReturnValue({decide:async()=>missing});renderDecision(`partial-${++seq}`);await sample();
    await waitFor(()=>expect(screen.queryByText('情景范围待补充')).not.toBeNull());fireEvent.click(screen.getByRole('link',{name:'如果条件变差 →'}));
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'基准净收益 —'})).not.toBeNull());expect(screen.getByText('下行收益缺少估算依据。')).toBeTruthy();
  });
});
