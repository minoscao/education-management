"use client";

import { useSyncExternalStore } from 'react';

let currentTime = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const snapshot = () => currentTime;
const serverSnapshot = () => 0;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    currentTime = Date.now();
    timer = setInterval(() => {
      currentTime = Date.now();
      for (const notify of listeners) notify();
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) { clearInterval(timer); timer = undefined; }
  };
}

export function useClock() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
