import { useEffect, useState } from 'react';
/** Keep both paper shells alive; a new selection replaces any pending content exit. */
export function usePaperSelection(cityId: string | null, reducedMotion: boolean) {
  const [displayedCityId, setDisplayedCity] = useState(cityId);
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    if (reducedMotion) { setDisplayedCity(cityId); setEntering(false); return; }
    if (displayedCityId !== cityId) {
      const exit = window.setTimeout(() => { setDisplayedCity(cityId); setEntering(true); }, 110);
      return () => window.clearTimeout(exit);
    }
    if (!entering) return;
    const enter = window.setTimeout(() => setEntering(false), 180);
    return () => window.clearTimeout(enter);
  }, [cityId, displayedCityId, entering, reducedMotion]);
  return { displayedCityId: reducedMotion ? cityId : displayedCityId,
    phase: reducedMotion ? 'idle' : displayedCityId !== cityId ? 'out' : entering ? 'in' : 'idle' } as const;
}
