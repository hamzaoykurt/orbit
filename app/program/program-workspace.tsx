'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Award, Check, Coffee, Flame, Pencil, Plus, Trash2, Undo2, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import type { WeeklyDeck } from '../rebuild/weekly-deck-model';
import { weekView } from '../rebuild/weekly-deck-model';
import { weekGoalRows } from '../home-today';
import { celebrateAt, celebrateBanner } from '../ui/celebrate';
import { PageHeader } from '../ui/page-header';
import { EmptyState } from '../ui/empty-state';
import { Hud } from '../ui/hud';
import { useFlip } from '../ui/list-motion';
import * as P from './program-model';
import type { Block, Events, Program, Task } from './program-model';
import './program.css';

type Props = { embedded?: boolean; focus?: ReactNode; program: Program; deck: WeeklyDeck; now: Date; motion: boolean; onChange: (program: Program, deck?: WeeklyDeck) => void; onFeedback: (tone: 'tap' | 'select' | 'confirm') => void };
const kindLabels: Record<string, string> = { body: 'Spor', english: 'English', make: 'Üret', research: 'Araştır', social: 'Sosyal', any: 'Genel' };

export function WeekPlan({ embedded = false, focus, program, deck, now, motion, onChange, onFeedback }: Props) {
  const weekKey = P.weekKeyOf(now);
  const today = P.dayIndexOf(now);
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<string | null>(null);
  const [breakEnd, setBreakEnd] = useState<number | null>(null);
  const [breakLeft, setBreakLeft] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const programRef = useRef(program); const deckRef = useRef(deck);
  const handlers = useRef({ onChange, onFeedback });
  useEffect(() => { programRef.current = program; deckRef.current = deck; handlers.current = { onChange, onFeedback }; });

  const level = P.levelOf(P.totalXp(program));
  const streak = P.currentStreak(program, now);
  const tasks = useMemo(() => P.dayTasks(program, weekKey, selected), [program, weekKey, selected]);
  const stats = P.dayStats(program, weekKey, selected);
  const week = program.weeks[weekKey] ?? P.emptyWeek();
  const goalRows = weekGoalRows(weekView(deck, weekKey));
  const bonusDone = Object.keys(week.done).filter(key => key.endsWith(':b')).length;
  const daysDone = Object.keys(week.days).length;

  useFlip(listRef, `${selected}:${tasks.map(task => `${task.key}${task.done ? 1 : 0}`).join()}`);
  const announce = (events: Events) => {
    if (events.levelUp) celebrateBanner(`Seviye ${events.levelUp.level}!`, events.levelUp.title, motion, true);
    else if (events.newBadges.length) celebrateBanner('Yeni rozet!', events.newBadges.map(b => b.name).join(', '), motion);
    else if (events.dayComplete) celebrateBanner('Gün tamam!', `+${P.XP_DAY} XP. Bugün harikaydın.`, motion);
  };
  const toggle = (task: Task, x: number, y: number) => {
    const result = P.toggleTask(programRef.current, deckRef.current, weekKey, task.key, new Date());
    onChange(result.program, result.deck);
    if (result.events.completed) {
      celebrateAt(x, y, { label: `+${task.bonus ? P.XP_BONUS : P.XP_STEP} XP`, motion });
      onFeedback('confirm');
      announce(result.events);
    } else onFeedback('tap');
  };
  const move = (task: Task, toDay: number) => { onChange(P.postpone(programRef.current, weekKey, task.key, toDay)); setPicker(null); onFeedback('select'); };
  const pull = () => { const result = P.pullToToday(programRef.current, weekKey, today); if (result.moved) { onChange(result.program); onFeedback('select'); } };
  const leftovers = selected === today && today > 0 && P.allTasks(program, weekKey).some(task => !task.bonus && !task.done && P.effectiveDay(program, weekKey, task) < today);

  useEffect(() => {
    if (breakEnd === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((breakEnd - Date.now()) / 1000));
      setBreakLeft(left);
      if (left === 0) {
        setBreakEnd(null);
        const result = P.addBreak(programRef.current, deckRef.current, P.weekKeyOf(new Date()), new Date());
        handlers.current.onChange(result.program, result.deck);
        celebrateBanner('Mola bitti', `+${P.XP_BREAK} XP. Hazırsan devam.`, motion);
        handlers.current.onFeedback('confirm');
        if (result.events.newBadges.length) window.setTimeout(() => celebrateBanner('Yeni rozet!', result.events.newBadges.map(b => b.name).join(', '), motion), 2700);
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [breakEnd, motion]);

  const fmt = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="wp">
      {!embedded && <>
        <PageHeader eyebrow="HAFTALIK RİTİM" title="Program" description="Bugünün adımlarını yap, seriyi koru, XP topla."
          action={<button className="ghost-button" onClick={() => setEditing(value => !value)} aria-pressed={editing}><Pencil size={16}/> {editing ? 'Bitti' : 'Düzenle'}</button>}/>
        <Hud level={level.level} title={level.title} inLevel={level.inLevel} step={level.step}>
          <span className="chip chip-streak"><Flame size={16}/> {streak} gün seri</span><span className="chip chip-xp"><Zap size={16}/> Bu hafta {P.weekXp(week)} XP</span><span className="chip chip-gold"><Award size={16}/> {Object.keys(program.profile.badges).length} rozet</span>
        </Hud>
      </>}
      {embedded && <div className="wp-embedded-bar"><span>{editing ? 'Blokları ve hafta düzenini düzenliyorsun' : 'Bu haftanın günleri ve blokları'}</span><button className="ghost-button" onClick={() => setEditing(value => !value)} aria-pressed={editing}><Pencil size={16}/> {editing ? 'Bitti' : 'Düzenle'}</button></div>}
      {embedded && !editing && focus}

      {!editing && <>
        <nav className="wp-days" aria-label="Haftanın günleri">
          {P.dayShort.map((name, day) => {
            const s = P.dayStats(program, weekKey, day);
            return <button key={name} className={`${selected === day ? 'active' : ''} ${day === today ? 'today' : ''} ${s.complete ? 'full' : ''}`} onClick={() => { setSelected(day); setPicker(null); }} aria-pressed={selected === day} aria-label={`${P.dayNames[day]}, ${s.done}/${s.total} görev${s.complete ? ', tamam' : ''}`}>
              <span>{name}</span><i aria-hidden="true"><u style={{ width: `${s.total ? Math.round(s.done / s.total * 100) : 0}%` }}/></i>{s.complete ? <Check size={12}/> : day === today ? <em/> : null}
            </button>;
          })}
        </nav>

        <div className="wp-dayhead"><h2>{P.dayNames[selected]}{selected === today ? ' · Bugün' : ''}</h2><span>{stats.done}/{stats.total} görev</span>
          {leftovers && <button className="text-button" onClick={pull}><Undo2 size={13}/> Önceki günlerden kalanları bugüne al</button>}</div>

        {!tasks.length && <EmptyState art="today" title="Bu gün boş" description="Düzenle bölümünden bir blok ata ya da rahatça dinlen."/>}
        <div ref={listRef} className="wp-slots">{P.slots.map(slot => {
          const list = tasks.filter(task => task.slot === slot);
          if (!list.length) return null;
          return <section key={slot} data-stagger className="wp-slot" aria-label={P.slotLabels[slot]}>
            <h3>{P.slotLabels[slot]}</h3>
            {list.map(task => <article key={task.key} data-flip={task.key} className={`wp-task ${task.bonus ? 'bonus' : ''} ${task.done ? 'done' : ''}`}>
              <div className="wp-task-main">
                {task.bonus ? <span className="wp-time bonus-tag">BONUS</span> : task.t && <span className="wp-time">{task.t}</span>}
                <strong>{task.text}</strong>
                <small>{task.bonus ? '+20 XP' : task.blockName}{task.kind && task.kind !== 'any' ? ` · Rebuild: ${kindLabels[task.kind]}` : ''}{task.movedFrom !== undefined ? ` · ${P.dayNames[task.movedFrom]} gününden ertelendi` : ''}</small>
              </div>
              <div className="wp-task-actions">
                <button className={`primary-button compact wp-go ${task.done ? 'undo' : ''}`} onClick={event => toggle(task, event.clientX || event.currentTarget.getBoundingClientRect().x + 20, event.clientY || event.currentTarget.getBoundingClientRect().y + 10)} aria-pressed={task.done !== null}>{task.done ? <><Undo2 size={14}/> Geri al</> : <><Check size={14}/> Yaptım</>}</button>
                {!task.bonus && !task.done && <button className="ghost-button compact" onClick={() => setPicker(picker === task.key ? null : task.key)} aria-expanded={picker === task.key}><ArrowRightLeft size={14}/> Ertele</button>}
              </div>
              {picker === task.key && <div className="wp-picker" role="group" aria-label="Hangi güne ertelensin?">{P.dayShort.map((name, day) => day !== selected && <button key={name} onClick={() => move(task, day)}>{name}</button>)}</div>}
            </article>)}
          </section>;
        })}</div>

        <div className="wp-side">
          <section className="wp-card surface" aria-label="Haftalık hedefler">
            <span className="eyebrow">HAFTALIK HEDEFLER · REBUILD</span>
            {goalRows.map(row => <div key={row.id} className={`wp-goal ${row.complete ? 'complete' : ''}`}><span>{row.name}</span><span className="pips" role="img" aria-label={`${row.done}/${row.target}`}>{Array.from({ length: Math.min(row.target, 7) }, (_, i) => <i key={i} className={i < row.done ? 'on' : ''}/>)}</span></div>)}
            <p className="wp-note">Bu hedefler Rebuild ile ortaktır; bağlı bir görevi bitirince otomatik işaretlenir.</p>
            <div className="wp-mini"><span>Tam gün <b>{daysDone}/7</b></span><span>Bonus <b>{bonusDone}/14</b></span><span>Mola <b>{Object.keys(week.breaks).length}</b></span></div>
          </section>
          <section className="wp-card surface" aria-label="Mola">
            <span className="eyebrow">MOLA</span>
            {breakEnd === null ? <><p className="wp-note">Kısa bir mola kendini toparlamana yardım eder. Bitince +{P.XP_BREAK} XP.</p>
              <div className="wp-break-actions">{[10, 15].map(minutes => <button key={minutes} className="ghost-button" onClick={() => { setBreakEnd(Date.now() + minutes * 60000); setBreakLeft(minutes * 60); onFeedback('select'); }}><Coffee size={15}/> {minutes} dk</button>)}</div></>
              : <div className="wp-break-run"><strong role="timer" aria-live="off">{fmt(breakLeft)}</strong><button className="ghost-button" onClick={() => setBreakEnd(null)}>Vazgeç</button></div>}
          </section>
          <section className="wp-card surface" aria-label="Rozetler">
            <span className="eyebrow">ROZETLER</span>
            <ul className="wp-badges">{P.badges.map(badge => { const got = program.profile.badges[badge.id]; return <li key={badge.id} className={got ? 'got' : ''}><Award size={18}/><span><strong>{badge.name}</strong><small>{got ? 'Kazanıldı' : badge.hint}</small></span></li>; })}</ul>
          </section>
          <p className="wp-rule">Kalkamadıysan suçluluk yok. O günü pas geç, kalanları bugüne al ve devam et.</p>
        </div>
      </>}

      {editing && <Editor program={program} onChange={onChange} now={now}/>}
    </div>
  );
}

function Editor({ program, onChange, now }: { program: Program; onChange: (program: Program) => void; now: Date }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { t: string; text: string }>>({});
  const t = program.template;
  const ask = (id: string, run: () => void) => { if (confirm === id) { setConfirm(null); run(); } else setConfirm(id); };
  const commit = (current: string, event: { target: HTMLInputElement }, apply: (value: string) => void, required = false) => {
    const value = event.target.value.trim();
    if (required && !value) { event.target.value = current; return; }
    if (value !== current) apply(value);
  };
  return (
    <div className="wp-editor">
      <p className="wp-note">Bloklar görev gruplarıdır. Her güne sabah, gün içi ve akşam için bir blok atarsın. Yaptığın görevler ve XP, bloğu değiştirsen de korunur.</p>
      {P.slots.map(slot => <section key={slot} className="wp-card surface"><div className="wp-editor-head"><h3>{P.slotLabels[slot]} blokları</h3><button className="ghost-button compact" onClick={() => onChange(P.addBlock(program, slot))}><Plus size={14}/> Blok ekle</button></div>
        {t.blocks.filter(b => b.slot === slot).map((block: Block) => <details key={block.id} className="wp-block">
          <summary>{block.name}<small>{block.steps.length} adım{block.kind && block.kind !== 'any' ? ` · Rebuild: ${kindLabels[block.kind]}` : ''}</small></summary>
          <div className="wp-block-body">
            <label>Blok adı<input defaultValue={block.name} key={block.name} maxLength={40} onBlur={event => commit(block.name, event, value => onChange(P.updateBlock(program, block.id, { name: value })), true)}/></label>
            <label>Rebuild hedefi<select value={block.kind ?? ''} onChange={event => onChange(P.updateBlock(program, block.id, { kind: (event.target.value || undefined) as Block['kind'] }))}><option value="">Bağlı değil</option>{Object.entries(kindLabels).filter(([k]) => k !== 'any').map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
            {block.steps.map(step => <div key={step.id} className="wp-step-edit"><input aria-label="Saat" defaultValue={step.t} key={`t${step.t}`} maxLength={12} placeholder="06:30" onBlur={event => commit(step.t, event, value => onChange(P.updateStep(program, block.id, step.id, { t: value })))}/><input aria-label="Adım" defaultValue={step.text} key={`x${step.text}`} maxLength={140} onBlur={event => commit(step.text, event, value => onChange(P.updateStep(program, block.id, step.id, { text: value })), true)}/><button className="icon-button" aria-label="Adımı sil" onClick={() => onChange(P.removeStep(program, block.id, step.id))}><Trash2 size={15}/></button></div>)}
            <form className="wp-step-edit" onSubmit={event => { event.preventDefault(); const d = draft[block.id]; if (d?.text.trim()) { onChange(P.addStep(program, block.id, d.t.trim(), d.text.trim())); setDraft(current => ({ ...current, [block.id]: { t: '', text: '' } })); } }}>
              <input aria-label="Yeni adım saati" placeholder="Saat" maxLength={12} value={draft[block.id]?.t ?? ''} onChange={event => setDraft(current => ({ ...current, [block.id]: { t: event.target.value, text: current[block.id]?.text ?? '' } }))}/>
              <input aria-label="Yeni adım" placeholder="Yeni adım ekle" maxLength={140} value={draft[block.id]?.text ?? ''} onChange={event => setDraft(current => ({ ...current, [block.id]: { t: current[block.id]?.t ?? '', text: event.target.value } }))}/>
              <button className="primary-button compact" disabled={!draft[block.id]?.text.trim()}><Plus size={14}/> Ekle</button>
            </form>
            <button className="ghost-button compact danger" onClick={() => ask(`del-${block.id}`, () => onChange(P.removeBlock(program, block.id)))}><Trash2 size={14}/> {confirm === `del-${block.id}` ? 'Emin misin? Tekrar bas' : 'Bloğu sil'}</button>
          </div>
        </details>)}
        {!t.blocks.some(b => b.slot === slot) && <p className="wp-note">Henüz blok yok.</p>}
        <label className="wp-bonus">Bonus ({P.slotLabels[slot].toLocaleLowerCase('tr')}, her gün, 2× XP)<input defaultValue={t.bonus[slot]} key={t.bonus[slot]} maxLength={80} placeholder="Boş bırakırsan bonus olmaz" onBlur={event => commit(t.bonus[slot], event, value => onChange(P.setBonus(program, slot, value)))}/></label>
      </section>)}
      <section className="wp-card surface"><h3>Hafta düzeni</h3>
        <div className="wp-matrix" role="table" aria-label="Gün ve blok atamaları">
          <div role="row" className="wp-matrix-head"><span/>{P.slots.map(s => <span key={s}>{P.slotLabels[s]}</span>)}</div>
          {P.dayNames.map((name, day) => <div role="row" key={name}><span>{name}</span>{P.slots.map(slot => <select key={slot} aria-label={`${name} ${P.slotLabels[slot]}`} value={t.week[String(day)]?.[slot] ?? ''} onChange={event => onChange(P.assignBlock(program, day, slot, event.target.value))}><option value="">—</option>{t.blocks.filter(b => b.slot === slot).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>)}</div>)}
        </div>
      </section>
      <section className="wp-card surface"><h3>Bakım</h3>
        <div className="wp-break-actions">
          <button className="ghost-button" onClick={() => ask('reset', () => onChange(P.resetTemplate(program)))}>{confirm === 'reset' ? 'Emin misin? Tekrar bas' : 'Şablonu varsayılana döndür'}</button>
          <button className="ghost-button" onClick={() => ask('compact', () => onChange(P.compactWeeks(program, 26, now)))}>{confirm === 'compact' ? 'Emin misin? Tekrar bas' : '6 aydan eski haftaları özetle'}</button>
        </div>
        <p className="wp-note">Varsayılana dönmek yalnız blokları ve hafta düzenini sıfırlar; XP, rozet ve geçmiş kalır. Özetleme eski haftaların ayrıntısını silip kazandığın XP değerini profiline ekler; serin korunur.</p>
      </section>
    </div>
  );
}
