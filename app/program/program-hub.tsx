import type { ReactNode } from 'react';
import { Award, Flame, Zap } from 'lucide-react';
import { Hud } from '../ui/hud';
import { dueWords } from '../rebuild/practice-model';
import type { Practice } from '../rebuild/practice-model';

export type ProgramTab = 'week' | 'journey';
type Level = { level: number; title: string; inLevel: number; step: number };

// One shell for Program (this week) and the 6-month journey: shared title, level/XP strip and tabs.
export function ProgramHub({ tab, onTab, level, streak, weekXp, badges, children }: {
  tab: ProgramTab; onTab: (tab: ProgramTab) => void; level: Level; streak: number; weekXp: number; badges: number; children: ReactNode;
}) {
  return <div className="program-hub" data-tab={tab}>
    <div className="program-hub-head">
      <header className="ph">
        <div className="ph-main"><div className="ph-text"><span className="eyebrow">HAFTALIK RİTİM · 26 HAFTALIK YOLCULUK</span><h1 className="ph-title">Program</h1><p className="ph-desc">Bugünün adımlarını yap, seriyi koru, XP topla; büyük resmi yolculukta gör.</p></div></div>
      </header>
      <Hud level={level.level} title={level.title} inLevel={level.inLevel} step={level.step}>
        <span className="chip chip-streak"><Flame size={16}/> {streak} gün seri</span>
        <span className="chip chip-xp"><Zap size={16}/> Bu hafta {weekXp} XP</span>
        <span className="chip chip-gold"><Award size={16}/> {badges} rozet</span>
      </Hud>
      <nav className="program-tabs" aria-label="Program bölümleri">
        <button type="button" aria-current={tab === 'week' ? 'page' : undefined} className={tab === 'week' ? 'active' : ''} onClick={() => onTab('week')}>Bu hafta</button>
        <button type="button" aria-current={tab === 'journey' ? 'page' : undefined} className={tab === 'journey' ? 'active' : ''} onClick={() => onTab('journey')}>6 Aylık Yolculuk</button>
      </nav>
    </div>
    {children}
  </div>;
}

// Rebuild's "one small step" card, shown at the top of the week tab.
export function RebuildFocusCard({ practice, now, onStart }: { practice: Practice; now: number; onStart: () => void }) {
  const due = dueWords(practice, now).filter(word => word.successes < 3);
  const topic = practice.research.find(item => item.id === practice.currentResearchId);
  const english = due.length > 0 || !practice.words.length;
  const title = english ? 'Birkaç dakikanı İngilizceye ayır.' : topic ? 'Merak ettiğin soruya geri dön.' : 'Bir fikre başlangıç yap.';
  return <section className="rx-focus program-focus" aria-label="Bugün bir küçük adım">
    <div><span className="rd-kicker">BUGÜN BİR KÜÇÜK ADIM</span><h2 className="rx-home-title">{title}</h2><p>Hepsini yapman gerekmiyor. Bir alan seç, kaldığın yerden devam et.</p></div>
    <button type="button" className="rd-done-action" onClick={onStart}>Yolculuğa git</button>
  </section>;
}
