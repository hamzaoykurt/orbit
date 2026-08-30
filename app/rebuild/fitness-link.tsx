'use client';
import { useSyncExternalStore } from 'react';
import { ArrowUpRight } from 'lucide-react';

export const fitnessIntent = (origin:string) => `intent://open#Intent;scheme=profitness;package=com.avonix.profitness;S.browser_fallback_url=${encodeURIComponent(`${origin}/fitness`)};end`;
const subscribe = () => () => {};
const clientHref = () => /Android/i.test(navigator.userAgent) ? fitnessIntent(window.location.origin) : '/fitness';
export function FitnessLink() {
  const href=useSyncExternalStore(subscribe,clientHref,()=>'/fitness');
  return <a className="rd-text-button" href={href}>Fitness’i aç <ArrowUpRight size={16}/></a>;
}
