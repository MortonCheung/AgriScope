import { useEffect, useRef, useState } from 'react';
import type { ProductDecisionRequest, ProductDecisionResponse } from '../../domain/decision/productApi';
import { getProductDecisionProvider } from '../../providers/productDecision';
import { canonicalProductRequest } from '../../providers/productDecision/validation';
/** Immediate accounts remain live; only the current validated recommendation can replace them. */
export function useProductDecision(request: ProductDecisionRequest | null) {
  const key = request ? canonicalProductRequest(request) : null;
  const latest = useRef(key); latest.current = key;
  const [reading, setReading] = useState<{ key: string; data: ProductDecisionResponse } | null>(null);
  useEffect(() => {
    if (!request || !key) return;
    const provider = getProductDecisionProvider();
    const cached = provider.peek?.(request);
    if (cached) { setReading({ key, data: cached }); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void provider.decide(request, { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted && latest.current === key) setReading({ key, data });
      }).catch(() => { /* The valid synchronous account remains available. */ });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
    // Request identity includes every user condition and the data reference date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return reading?.key === key ? reading.data : null;
}
