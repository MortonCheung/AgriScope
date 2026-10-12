// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V2Figure } from './Figure';

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('research figure preserves natural dimensions and keyboard zoom', () => {
  it.each([
    ['shenyang/A07_district_structure.png', 1937, 567],
    ['chaoyang/A03_lag_profile.png', 975, 585],
  ] as const)('reserves the actual PNG ratio for %s before lazy loading', (identity, width, height) => {
    const [city, file] = identity.split('/');
    const { container } = render(<V2Figure src={`/api/research/${city}/figures/${file}`} alt="研究配图" index={1} />);
    const img = container.querySelector('img')!;
    const media = container.querySelector<HTMLElement>('.research-figure__media')!;
    expect(img.getAttribute('width')).toBe(String(width));
    expect(img.getAttribute('height')).toBe(String(height));
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(media.style.aspectRatio).toBe(`${width} / ${height}`);
    fireEvent.keyDown(media, { key: 'Enter' });
    expect(container.querySelector('figure')?.getAttribute('data-expanded')).toBe('true');
    expect(media.style.aspectRatio).toBe('');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('figure')?.hasAttribute('data-expanded')).toBe(false);
    expect(media.style.aspectRatio).toBe(`${width} / ${height}`);
  });
});
