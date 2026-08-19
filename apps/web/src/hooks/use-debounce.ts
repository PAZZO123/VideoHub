import { useEffect, useState } from 'react';

/**
 * Delays a value until it stops changing for `delay` ms.
 *
 * Used by instant search so a query fires once per pause in typing rather than
 * once per keystroke.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
