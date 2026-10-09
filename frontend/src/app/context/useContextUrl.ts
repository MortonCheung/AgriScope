import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { readContextFromSearch, useAppContext, writeContextToSearch } from './appContext';

/**
 * 四要素与 URL 的双向同步（Frontend V3 §9）。
 *
 * 规则（顺序不可颠倒）：
 *   1. **URL 为准**：URL 上写了合法值就以它为准（这样刷新 / 后退 / 前进 / 分享链接都能复原上下文）；
 *   2. **store 补齐**：URL 没写的要素，才由 store 写回 URL；
 *   3. 写回一律 `replace`，避免污染浏览器历史；
 *   4. 写回前先比较**解析后的值**，相同就什么都不做，杜绝死循环。
 *
 * 同步只处理四要素（City / Crop / Date / Horizon），
 * 其它 query（例如决策页的 `view` / `plan`）原样保留，不参与比较。
 */
export function useContextUrlSync(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const cityId = useAppContext((state) => state.cityId);
  const crop = useAppContext((state) => state.crop);
  const horizon = useAppContext((state) => state.horizon);
  const asOf = useAppContext((state) => state.asOf);

  useEffect(() => {
    const parsed = readContextFromSearch(location.search);
    const state = useAppContext.getState();
    if (parsed.cityId !== undefined && parsed.cityId !== state.cityId) state.setCity(parsed.cityId);
    if (parsed.crop !== undefined && parsed.crop !== state.crop) state.setCrop(parsed.crop);
    if (parsed.horizon !== undefined && parsed.horizon !== state.horizon) state.setHorizon(parsed.horizon);
    if (parsed.asOf !== undefined && parsed.asOf !== state.asOf) state.setAsOf(parsed.asOf);
  }, [location.search]);

  useEffect(() => {
    const current = readContextFromSearch(location.search);
    const same = current.cityId === cityId
      && (current.crop ?? null) === crop
      && current.horizon === horizon
      && (current.asOf ?? null) === asOf;
    if (same) return;
    const search = writeContextToSearch(location.search, { cityId, crop, horizon, asOf });
    navigate({ pathname: location.pathname, search: `?${search}` }, { replace: true });
  }, [asOf, cityId, crop, horizon, location.pathname, location.search, navigate]);
}