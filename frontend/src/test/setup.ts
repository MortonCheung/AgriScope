// React Router's data APIs construct Request with the jsdom AbortSignal realm.
// Node's undici Request rejects that cross-realm signal; keep the browser contract
// while making memory-router tests deterministic.
if (typeof window !== 'undefined' && typeof globalThis.Request === 'function') {
  const NativeRequest = globalThis.Request;
  class TestRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      // The memory router never needs request cancellation; omit the cross-realm
      // signal so Node's undici Request accepts jsdom navigation in tests.
      const compatible = init ? { ...init, signal: undefined } : init;
      super(input, compatible);
    }
  }
  globalThis.Request = TestRequest as typeof Request;
}
