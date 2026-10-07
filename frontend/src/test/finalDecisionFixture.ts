import type { FinalDecisionRequest } from '../domain/decision/types';
/** Runtime-shaped test data. Never imported by application code. */
export function finalRequest():FinalDecisionRequest{return {contract_version:'1',user_context:{city_id:'shenyang',area_mu:60,budget_cny:300000,risk_preference:'balanced',crop_preferences:['西红柿'],actual_inputs:{},market_context:{as_of:'2026-09-14',horizon_days:30,harvest_date:null}},input_source:{kind:'structured'}};}
export function finalEnvelope(status='OK',request=finalRequest()){
  const row={city:'沈阳',crop:'西红柿',area_mu:60,budget:300000,horizon_days:request.user_context.market_context.horizon_days,harvest_date:'2026-10-14',status,
    price:{mid:3.944,low:2.987,high:5.622,scenario_only:request.user_context.market_context.horizon_days>=60},scenario_range:{status:'scenario_range'},
    profit:{available:true,profit:24600,roi:.2,break_even_price:2,cost_per_mu:1000,expected_yield_per_mu:500,cost_source_class:'local_reference',yield_source_class:'regional_proxy'},
    confidence:{overall_confidence:68.7,price_confidence:86.9,profit_confidence:13.8,risk_confidence:93.7},hri:{available:true,value:60.7},market_risk:{available:true,value:46.3},climate_exposure:{available:true,value:37.5},
    reasons:['HRI=60.7（medium，5 组件）','Market Risk=46.3'],warnings:[],proxy_flags:[]};
  return {request,batch:{status,n:1,n_evaluable:1,ranking:[{crop:'西红柿'}],all:[row]},market_as_of:request.user_context.market_context.as_of,model_version:'final_v1',data_version:'final_v1',code_fingerprint:'test-native-contract'};
}
export function finalCapability(cityId='shenyang') {return {city_id:cityId,tier:'FULL',supported:true,crops:[{id:'西红柿',label:'西红柿',horizons:[{days:7,mode:'model' as const},{days:30,mode:'model' as const},{days:90,mode:'scenario_only' as const}]},{id:'黄瓜',label:'黄瓜',horizons:[{days:30,mode:'model' as const},{days:90,mode:'scenario_only' as const}]}],market_as_of:'2026-09-14',model_version:'final_v1',data_version:'final_v1',code_fingerprint:'test-native-contract',limitation:null};}
