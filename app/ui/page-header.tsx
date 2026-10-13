import type { ReactNode } from 'react';
import './feel.css';

// One skeleton for every page: identity strip, big title, one line, summary chips.
export function PageHeader({ eyebrow, title, description, chips, action }: { eyebrow?: string; title: string; description?: string; chips?: ReactNode; action?: ReactNode }) {
  return <header className="ph">
    <i className="ph-strip" aria-hidden="true"/>
    <div className="ph-main">
      <div className="ph-text">{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1 className="ph-title">{title}</h1>{description && <p className="ph-desc">{description}</p>}</div>
      {action && <div className="ph-action">{action}</div>}
    </div>
    {chips && <div className="ph-chips">{chips}</div>}
  </header>;
}
