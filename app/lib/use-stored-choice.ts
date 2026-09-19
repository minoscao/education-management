"use client";

import { useCallback, useSyncExternalStore } from 'react';

export function useStoredChoice<T extends string>(key: string, choices: readonly T[], fallback: T) {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener('storage', notify);
    window.addEventListener('preference-change', notify);
    return () => {
      window.removeEventListener('storage', notify);
      window.removeEventListener('preference-change', notify);
    };
  }, []);
  const snapshot = () => {
    try {
      const value = window.localStorage.getItem(key) as T;
      return choices.includes(value) ? value : fallback;
    } catch { return fallback; }
  };
  const value = useSyncExternalStore(subscribe, snapshot, () => fallback);
  const setValue = (next: T) => {
    try {
      window.localStorage.setItem(key, next);
      window.dispatchEvent(new Event('preference-change'));
    } catch { /* Storage can be unavailable in private browser sessions. */ }
  };
  return [value, setValue] as const;
}
