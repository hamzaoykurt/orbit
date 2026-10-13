import type { ReactNode } from 'react';

// Level ring + XP bar + chips in one white pill (brief-canli-ui §3). Not sticky.
export function Hud({ level, title, inLevel, step, children }: { level: number; title: string; inLevel: number; step: number; children?: ReactNode }) {
  const percent = Math.round((inLevel / step) * 100);
  return <section className="hud" aria-label="Seviye">
    <div className="hud-ring" style={{ '--p': `${percent}%` } as React.CSSProperties} aria-hidden="true"><b>{level}</b></div>
    <div className="hud-main">
      <div className="hud-top"><strong>{title}</strong><span>{inLevel} / {step} XP</span></div>
      <div className="hud-bar" role="progressbar" aria-valuemin={0} aria-valuemax={step} aria-valuenow={inLevel} aria-label="Seviye ilerlemesi"><i style={{ transform: `scaleX(${inLevel / step})` }}/></div>
    </div>
    {children && <div className="hud-chips">{children}</div>}
  </section>;
}
