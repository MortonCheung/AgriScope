import { RESEARCH_FIGURE_DIMENSIONS } from './figureDimensions';

/** Both the research API and legacy static assets use the same city/file identity. */
export function researchFigureSize(src: string): readonly [number, number] | undefined {
  try {
    const pathname = new URL(src, 'https://research.local').pathname;
    const match = /\/research\/([^/]+)\/figures\/([^/]+)$/.exec(pathname);
    if (!match) return undefined;
    return RESEARCH_FIGURE_DIMENSIONS[`${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`];
  } catch {
    return undefined;
  }
}
