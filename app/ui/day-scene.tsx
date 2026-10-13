import type { ReactNode } from 'react';

// Time-of-day scene (brief-canli-ui §4). One static SVG; the phase and sun position come from the clock once per render.
export type Phase = 'sabah' | 'gun' | 'aksam' | 'gece';
export function phaseOf(date: Date): Phase {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'sabah';
  if (hour >= 11 && hour < 17) return 'gun';
  if (hour >= 17 && hour < 21) return 'aksam';
  return 'gece';
}
// Fraction of the way along the sky: sun 05:00 to 21:00, moon 21:00 to 05:00.
function skyProgress(date: Date, night: boolean) {
  const hours = date.getHours() + date.getMinutes() / 60;
  return night ? ((hours + 3) % 24) / 8 : Math.min(1, Math.max(0, (hours - 5) / 16));
}
const stars: [number, number, number][] = [[54, 14, 3], [62, 38, 2], [70, 20, 3], [78, 46, 2], [84, 12, 3], [90, 34, 2], [46, 30, 2], [96, 52, 2]];

export function DayScene({ now, eyebrow, title, text, action, className = '' }: { now: Date; eyebrow?: string; title: string; text?: string; action?: ReactNode; className?: string }) {
  const phase = phaseOf(now);
  const night = phase === 'gece';
  const t = skyProgress(now, night);
  // The sun keeps to the right half so the greeting on the left always has a calm background.
  const x = 62 + t * 30, y = 50 - Math.sin(t * Math.PI) * 30;
  return <section className={`scene ${className}`.trim()} data-phase={phase} aria-label="Gün sahnesi">
    <div className="scene-sky" aria-hidden="true">
      {night && stars.map(([left, top, size], i) => <i key={i} className="scene-star" style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }}/>)}
      <span className={`scene-sun${night ? ' moon' : ''}`} style={{ left: `${x.toFixed(1)}%`, top: `${y.toFixed(1)}%` }}/>
      <svg className="scene-cloud drift" style={{ left: '40%', top: '10%' }} width="96" height="36" viewBox="0 0 96 36"><ellipse cx="42" cy="24" rx="34" ry="11" fill="#fff" opacity=".85"/><ellipse cx="58" cy="15" rx="22" ry="12" fill="#fff" opacity=".85"/></svg>
      <svg className="scene-cloud" style={{ left: '76%', top: '58%' }} width="72" height="28" viewBox="0 0 72 28"><ellipse cx="32" cy="18" rx="26" ry="9" fill="#fff" opacity=".6"/><ellipse cx="44" cy="11" rx="16" ry="9" fill="#fff" opacity=".6"/></svg>
      <svg className="scene-hills" viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 60V28C60 8 120 10 180 24S300 40 400 14V60z" fill="#fff" opacity=".3"/><path d="M0 60V40C80 24 160 30 240 42S340 48 400 32V60z" fill="#fff" opacity=".5"/></svg>
    </div>
    <div className="scene-copy">
      {eyebrow && <span className="scene-eyebrow">{eyebrow}</span>}
      <h1 className="scene-title">{title}</h1>
      {text && <p className="scene-text">{text}</p>}
    </div>
    {action && <div className="scene-action">{action}</div>}
  </section>;
}
