/**
 * 目录相关的展示文案（纯前端措辞，不含任何研究内容）。
 */

/**
 * 引用出处标签：`A2 §4`。
 *
 * 只写 canonical 方向 id 与章节号：让读者能回到研究原文，
 * 又不暴露数据文件名（§38）。
 */
export function quoteLabel(articleId: string, section: number): string {
  return `${articleId} §${section}`;
}

/** 研究点状态的说明（§21）。unsupported 的具体判定写在点的 reason 里，取自研究侧原句。 */
export function pointStatusLabel(status: 'ready' | 'pending' | 'unsupported'): string {
  if (status === 'ready') return '已有研究内容';
  if (status === 'pending') return '研究内容待接入';
  return '研究侧判定：当前数据不足';
}
