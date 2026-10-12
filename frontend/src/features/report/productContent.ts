/** Product presentation only: published research assets remain unchanged. */
const HIDDEN_SECTION = /(?:技术架构|工程说明|开发说明|部署说明|发布流程|^研究(?:局限|限制)$|^limitations$)/i;
const DEVELOPMENT_PARAGRAPH = /(?:前端不(?:代写|改写|生成)|研究侧(?:未随附|仅导出)|请求不修改|缓存路径|本轮(?:准备|不宣称)|定时采集与部署启用)/i;

export function isProductSection(title: string): boolean {
  return !HIDDEN_SECTION.test(title);
}

/** Hide dedicated internal/limitations sections; qualifications stay with each result. */
export function productText(source: string): string {
  let hiddenLevel: number | null = null;
  return source.split(/\n\s*\n/).filter(block => {
    const heading = /^(#{1,6})\s+(.+)/.exec(block.trim());
    if (heading) {
      const level = heading[1].length;
      if (hiddenLevel !== null && level > hiddenLevel) return false;
      hiddenLevel = isProductSection(heading[2]) ? null : level;
    }
    return hiddenLevel === null && !DEVELOPMENT_PARAGRAPH.test(block);
  }).join('\n\n');
}

export function productSections<T extends { title: string; content: string }>(sections: readonly T[]): T[] {
  return sections.filter(section => isProductSection(section.title)).map(section => ({ ...section, content: productText(section.content) }));
}
