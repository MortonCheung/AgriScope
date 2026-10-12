import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppContext } from '../../app/context/appContext';
import { cropIdentity, resolveSourceCrop } from '../../domain/decision/cropIdentity';
import { defaultSelectorValues, uniqueValuesInSourceOrder, type DataRow } from '../../domain/research/v2/selectors';

/** A selection is valid only for this resource and its actual source dimensions. */
export function useResearchSelectors(identity: string, rows: DataRow[], selectors: string[]) {
  const [, setParams] = useSearchParams();
  const requestedCrop = useAppContext(state => state.crop);
  const [stored, setStored] = useState<{ identity: string; picked: Record<string, string> }>({ identity, picked: {} });
  const picked = stored.identity === identity ? stored.picked : {};
  const defaults = defaultSelectorValues(rows, selectors);
  const selected: Record<string, string> = {};
  for (const column of selectors) {
    const values = uniqueValuesInSourceOrder(rows, column);
    const context = column === 'crop' && requestedCrop ? resolveSourceCrop(requestedCrop, values) : undefined;
    selected[column] = context ?? (values.includes(picked[column]) ? picked[column] : defaults[column]);
  }
  const change = (column: string, value: string) => {
    setStored(previous => ({ identity, picked: { ...(previous.identity === identity ? previous.picked : {}), [column]: value } }));
    if (column === 'crop') {
      const crop = cropIdentity(value);
      useAppContext.getState().setCrop(crop);
      setParams(previous => { const next = new URLSearchParams(previous); next.set('crop', crop); return next; }, { replace: true });
    }
  };
  return { selected, change };
}
