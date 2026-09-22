/**
 * 异步资源的三种状态（V4 §四十四，V5 §28 起从 v1 的研究仓库模块里独立出来）。
 *
 * 之所以单独一个文件：`useCachedResource` 与 v2 载荷 hook 只需要这个类型，
 * 不应该为了它把整个 v1 研究仓库（以及它的旧 G/C 载荷访问）继续打进包里。
 */
export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: string };
