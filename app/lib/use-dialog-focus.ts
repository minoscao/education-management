"use client";

import { useEffect, useRef } from 'react';

export function useDialogFocus<T extends HTMLElement>(onClose: () => void, busy = false) {
  const ref = useRef<T>(null);
  const actions = useRef({ onClose, busy });
  useEffect(() => { actions.current = { onClose, busy }; }, [onClose, busy]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(item => item.getClientRects().length > 0);
    focusable()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (document.querySelectorAll('[aria-modal="true"]').item(document.querySelectorAll('[aria-modal="true"]').length - 1) !== dialog) return;
      if (event.key === 'Escape' && !actions.current.busy) {
        event.preventDefault();
        event.stopPropagation();
        actions.current.onClose();
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog!.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog!.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return ref;
}
