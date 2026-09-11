/**
 * Custom React hooks for performance optimization
 */

import { useEffect, useState } from "preact/hooks";

/**
 * Debounces a value. Useful for delaying expensive computations
 * or updates until a value stops changing rapidly (e.g., during typing).
 * 
 * @param value - The value to debounce
 * @param delay - The debounce delay in milliseconds (default: 300ms)
 * @returns The debounced value
 * 
 * @example
 * ```tsx
 * const debouncedSearchQuery = useDebounce(searchQuery, 500);
 * 
 * useEffect(() => {
 *   // This effect runs only after the user stops typing for 500ms
 *   performSearch(debouncedSearchQuery);
 * }, [debouncedSearchQuery]);
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set the debounced value immediately if delay is 0
    if (delay === 0) {
      setDebouncedValue(value);
      return;
    }

    // Set up the timeout to update the debounced value
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup the timeout if the value changes before the delay completes
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Throttles a value. Useful for limiting the rate at which a value
 * can change (e.g., for scroll events or frequent updates).
 * 
 * @param value - The value to throttle
 * @param limit - The minimum time between updates in milliseconds (default: 100ms)
 * @returns The throttled value
 * 
 * @example
 * ```tsx
 * const throttledScrollPosition = useThrottle(scrollPosition, 100);
 * 
 * useEffect(() => {
 *   // This effect runs at most once every 100ms
 *   handleScroll(throttledScrollPosition);
 * }, [throttledScrollPosition]);
 * ```
 */
export function useThrottle<T>(value: T, limit: number = 100): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdate;

    if (timeSinceLastUpdate >= limit) {
      setThrottledValue(value);
      setLastUpdate(now);
    } else {
      // Schedule an update at the limit time
      const timeout = limit - timeSinceLastUpdate;
      const handler = setTimeout(() => {
        setThrottledValue(value);
        setLastUpdate(Date.now());
      }, timeout);

      return () => clearTimeout(handler);
    }
  }, [value, limit, lastUpdate]);

  return throttledValue;
}

/**
 * Memoizes a computation that depends on multiple values.
 * Similar to useMemo but with a custom comparison function.
 * 
 * @param computation - The function to memoize
 * @param dependencies - The dependency array
 * @param compare - Optional custom comparison function (default: shallow equality)
 * @returns The memoized result
 * 
 * @example
 * ```tsx
 * const expensiveResult = useMemoize(
 *   () => computeExpensiveValue(a, b),
 *   [a, b],
 *   (oldDeps, newDeps) => oldDeps[0] === newDeps[0] && oldDeps[1] === newDeps[1]
 * );
 * ```
 */
export function useMemoize<T, D extends unknown[]>(
  computation: () => T,
  dependencies: D,
  compare: (oldDeps: D, newDeps: D) => boolean = (oldDeps, newDeps) => {
    return oldDeps.length === newDeps.length &&
      oldDeps.every((dep, i) => dep === newDeps[i]);
  }
): T {
  const [memoizedValue, setMemoizedValue] = useState<T>(computation());
  const [prevDeps, setPrevDeps] = useState<D>(dependencies);

  useEffect(() => {
    if (!compare(prevDeps, dependencies)) {
      setMemoizedValue(computation());
      setPrevDeps(dependencies);
    }
  }, [computation, dependencies, compare, prevDeps]);

  return memoizedValue;
}

/**
 * Tracks the previous value of a dependency. Useful for detecting changes.
 * 
 * @param value - The value to track
 * @returns The previous value
 * 
 * @example
 * ```tsx
 * const prevValue = usePrevious(value);
 * 
 * useEffect(() => {
 *   if (prevValue !== undefined && value !== prevValue) {
 *     console.log('Value changed from', prevValue, 'to', value);
 *   }
 * }, [value, prevValue]);
 * ```
 */
export function usePrevious<T>(value: T): T | undefined {
  const [prevValue, setPrevValue] = useState<T | undefined>(undefined);

  useEffect(() => {
    setPrevValue(value);
  }, [value]);

  return prevValue;
}

/**
 * Measures the execution time of a callback and logs it.
 * Useful for performance debugging.
 * 
 * @param name - The name to use for logging
 * @returns A wrapped function that measures and logs execution time
 * 
 * @example
 * ```tsx
 * const timedFn = usePerformanceTimer('expensiveOperation');
 * timedFn(() => performExpensiveOperation());
 * // Logs: "expensiveOperation took 123ms"
 * ```
 */
export function usePerformanceTimer(name: string): (callback: () => void) => void {
  return (callback: () => void) => {
    const start = performance.now();
    try {
      callback();
    } finally {
      const duration = performance.now() - start;
      if (duration > 10) { // Only log operations that take more than 10ms
        console.log(`${name} took ${duration.toFixed(2)}ms`);
      }
    }
  };
}
