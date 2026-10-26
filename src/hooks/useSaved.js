import { useCallback, useEffect, useState } from 'react';
import { getSaved, subscribe, toggleSaved } from '../services/savedStore';

/** Reactive access to the saved-research list. */
export function useSaved() {
  const [items, setItems] = useState(() => getSaved());

  useEffect(() => subscribe(setItems), []);

  const toggle = useCallback((entry) => {
    toggleSaved(entry);
  }, []);

  const has = useCallback((id) => items.some((item) => item.id === id), [items]);

  return { items, toggle, has };
}
