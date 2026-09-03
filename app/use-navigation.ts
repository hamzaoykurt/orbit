'use client';

import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createNavigation, homeSnapshot } from './navigation';
import type { ViewValue } from './navigation';

let clientNavigation: ReturnType<typeof createNavigation> | undefined;
const getNavigation = () => {
  if (typeof window === 'undefined') return undefined;
  return clientNavigation ??= createNavigation(window);
};
const subscribe = (listener: () => void) => getNavigation()?.subscribe(listener) ?? (() => {});
const getSnapshot = () => getNavigation()?.getSnapshot() ?? homeSnapshot;
const getServerSnapshot = () => homeSnapshot;

export function useNavigation() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => { getNavigation()?.start(); }, []);
  return { ...snapshot, navigate: navigation.navigate, backTo: navigation.backTo };
}

export const navigation = {
  navigate: (...args: Parameters<ReturnType<typeof createNavigation>['navigate']>) => getNavigation()?.navigate(...args),
  backTo: (...args: Parameters<ReturnType<typeof createNavigation>['backTo']>) => getNavigation()?.backTo(...args),
  backToView: (...args: Parameters<ReturnType<typeof createNavigation>['backToView']>) => getNavigation()?.backToView(...args),
};

// Like useState, but only for screen selections (never text inputs or records).
// Overlay keys are cleared when navigating to a different screen or reloading.
export function useNavigationState<T extends ViewValue>(key: string, initialValue: T | (() => T), closeOnDefault = false, rememberInitial = false): [T, Dispatch<SetStateAction<T>>] {
  const [initial] = useState(initialValue);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = Object.hasOwn(snapshot.views, key) ? snapshot.views[key] as T : initial;
  useEffect(() => { if (rememberInitial) getNavigation()?.rememberView(key, initial); }, [key, initial, rememberInitial]);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    const store = getNavigation();
    if (!store) return;
    store.start();
    const current = store.getSnapshot().views;
    const previous = Object.hasOwn(current, key) ? current[key] as T : initial;
    const next = typeof action === 'function' ? action(previous) : action;
    store.setView(key, next, rememberInitial ? null : initial, closeOnDefault);
  }, [key, initial, closeOnDefault, rememberInitial]);
  return [value, setValue];
}

// Payloads such as temporary photo URLs stay in the component, not history.
export function useDismissOnBack(key: string, open: boolean, onClose: () => void) {
  const [tracked, setTracked] = useNavigationState<boolean>(`overlay:${key}`, false, true);
  const wasOpen = useRef(false);
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (open && !wasOpen.current) { wasOpen.current = true; setTracked(true); }
    else if (!open) { wasOpen.current = false; if (tracked) setTracked(false); }
    else if (!tracked) { wasOpen.current = false; close(); }
  }, [open, tracked, setTracked]);
}
