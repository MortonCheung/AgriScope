import type { DecisionCandidate, DecisionResult } from '../../domain/decision/types';
import { dateWindow } from './DecisionVisuals';

export function shownConfidence(result:DecisionResult,candidate:DecisionCandidate){return result.data_status==='model'?candidate.confidence:result.recommendation.confidence;}
export function actualProfit(candidate:DecisionCandidate){
  return candidate.profit.base!==null&&(candidate.profit_basis==='user_input'||candidate.inputs.cost_source==='用户实际输入'&&candidate.inputs.yield_source==='用户实际输入');
}
export function evaluationLabel(candidate:DecisionCandidate){
  return candidate.market_context?`数据基准 ${candidate.market_context.as_of} · ${candidate.market_context.horizon_days} 天${candidate.market_context.scenario_only?' · 仅情景':''}`:`${dateWindow(candidate.harvest_window)} 上市`;
}
export function profitLabel(candidate:DecisionCandidate){return actualProfit(candidate)?'实际投入下收益情景':candidate.profit.base===null?'收益待补充实际投入':'收益参考情景 · 基于参考成本/亩产';}
