'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import './feel.css';

const EXIT_MS = 220;
const mobileQuery = '(max-width: 820px)';
const subscribe = (listener: () => void) => { const media = window.matchMedia(mobileQuery); media.addEventListener('change', listener); return () => media.removeEventListener('change', listener); };
const isMobile = () => window.matchMedia(mobileQuery).matches;

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called when the scrim is pressed (lets the app play its tap sound). */
  onBackdrop?: () => void;
  cardClassName?: string;
  cardProps?: HTMLAttributes<HTMLElement>;
  label: string;
  children: ReactNode;
};

// Bottom sheet on phones (drag the grip down to dismiss), centred dialog on desktop.
// The last open content is kept while the exit animation plays.
export function Sheet({ open, onClose, onBackdrop, cardClassName = '', cardProps, label, children }: Props) {
  const mobile = useSyncExternalStore(subscribe, isMobile, () => false);
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>(open ? 'open' : 'closed');
  const [kept, setKept] = useState({ children, cardClassName });
  const layer = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  // Adjusting state while rendering: follow `open`, remember the content shown while open.
  if (open && phase !== 'open') setPhase('open');
  if (!open && phase === 'open') setPhase('closing');
  if (open && (kept.children !== children || kept.cardClassName !== cardClassName)) setKept({ children, cardClassName });

  useEffect(() => {
    if (phase !== 'closing') return;
    const timer = window.setTimeout(() => setPhase('closed'), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const sheet = mobile && !kept.cardClassName.includes('search');
  const visible = phase !== 'closed';

  // Drag the grip down: follow the finger, close past 80px or 0.5px/ms, otherwise spring back.
  useEffect(() => {
    const handle = grip.current, node = layer.current;
    if (!handle || !node || !sheet) return;
    let startY = 0, startT = 0, dy = 0, active = false;
    const place = (value: number) => { node.style.setProperty('--sheet-y', `${value}px`); node.style.setProperty('--sheet-p', String(Math.max(0, 1 - value / 480))); };
    const down = (event: PointerEvent) => { handle.setPointerCapture(event.pointerId); startY = event.clientY; startT = event.timeStamp; dy = 0; active = true; node.classList.add('is-dragging'); node.classList.remove('is-settling'); };
    const move = (event: PointerEvent) => { if (!active) return; dy = Math.max(0, event.clientY - startY); place(dy); };
    const up = (event: PointerEvent) => {
      if (!active) return;
      active = false;
      node.classList.remove('is-dragging');
      if (dy > 80 || dy / Math.max(1, event.timeStamp - startT) > 0.5) { close.current(); return; }
      node.classList.add('is-settling'); place(0);
      window.setTimeout(() => node.classList.remove('is-settling'), 260);
    };
    handle.addEventListener('pointerdown', down); handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    return () => { handle.removeEventListener('pointerdown', down); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
  }, [sheet, visible]);

  if (!visible) return null;
  return (
    <div ref={layer} className={`modal-layer sheet-layer${sheet ? ' is-sheet' : ''}${phase === 'closing' ? ' is-closing' : ''}`} role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget && phase === 'open') { onBackdrop?.(); onClose(); } }}>
      <section {...cardProps} className={`modal-card ${kept.cardClassName}`} role="dialog" aria-modal="true" aria-label={label}>
        <div ref={grip} className="sheet-grip" aria-hidden="true"><i/></div>
        {kept.children}
      </section>
    </div>
  );
}
