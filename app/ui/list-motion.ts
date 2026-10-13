'use client';

import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

const motionOff = () => typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');

// FLIP for keyed lists: children carry data-flip="<id>". When the order or the
// content changes (signature), every moved child slides from its old place to
// the new one using transform only. Entrance and exit are handled in CSS.
export function useFlip(container: RefObject<HTMLElement | null>, signature: string) {
  const previous = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = container.current; if (!root) return;
    const next = new Map<string, number>();
    const items = [...root.querySelectorAll<HTMLElement>('[data-flip]')];
    for (const item of items) next.set(item.dataset.flip!, item.getBoundingClientRect().top + window.scrollY);
    if (!motionOff()) {
      for (const item of items) {
        const before = previous.current.get(item.dataset.flip!);
        const after = next.get(item.dataset.flip!)!;
        if (before === undefined || Math.abs(before - after) < 2) continue;
        item.animate([{ transform: `translateY(${before - after}px)` }, { transform: 'translateY(0)' }], { duration: 200, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    }
    previous.current = next;
  }, [container, signature]);
}

// Slides a row out (left + fade), then runs the removal so the gap closes with FLIP.
export function leaveThen(element: HTMLElement | null, done: () => void) {
  if (!element || motionOff()) { done(); return; }
  element.classList.add('flip-leaving');
  window.setTimeout(done, 200);
}
