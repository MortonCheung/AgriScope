import type { ProductDecisionProvider, ProductDecisionRequest, ProductDecisionResponse } from '../../domain/decision/productApi';
import { canonicalProductRequest, validateProductRequest, validateProductResponse } from './validation';
const TTL = 120_000;
export class HttpProductDecisionProvider implements ProductDecisionProvider {
  private cache = new Map<string, { time: number; value: ProductDecisionResponse }>();
  peek(request: ProductDecisionRequest) {
    const key = canonicalProductRequest(request), saved = this.cache.get(key);
    if (!saved || Date.now() - saved.time > TTL) { this.cache.delete(key); return null; }
    return structuredClone(saved.value);
  }
  async decide(request: ProductDecisionRequest, options: { signal?: AbortSignal } = {}) {
    validateProductRequest(request);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const saved = this.peek(request);
    if (saved) return saved;
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeout = window.setTimeout(abort, 24_000);
    try {
      const response = await fetch('/api/product/decision', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
      if (!response.ok) throw new Error('决策暂时无法更新。');
      const value = await validateProductResponse(await response.json(), request);
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      this.cache.set(canonicalProductRequest(request), { time: Date.now(), value });
      if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
      return structuredClone(value);
    } finally { window.clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
  }
}
const provider = new HttpProductDecisionProvider();
export function getProductDecisionProvider(): ProductDecisionProvider { return provider; }
