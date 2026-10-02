'use client';
import { useState } from 'react';
import { ArrowRight, Plus, Search, FolderOpen, ClipboardCopy } from 'lucide-react';
import type { ProjectWorkspaceData } from './project-types';
import { lifecycleFromStage, lifecycleLabels } from './planning-types';
import type { ProjectLifecycle } from './planning-types';
import './project-planning.css';
import './project-experience.css';
import './project-workbench.css';

type Metric = { project: { id: string; title: string; stage: number; due: string; tags: string[] }; progress: number; done: number; total: number; nextAction?: string };
const groups: { id: string; label: string; states: ProjectLifecycle[] }[] = [
  { id: 'working', label: 'Üzerinde çalıştıkların', states: ['active', 'mvp', 'research'] },
  { id: 'ideas', label: 'Fikirler', states: ['idea'] },
  { id: 'later', label: 'Beklemede', states: ['paused'] },
  { id: 'completed', label: 'Tamamlananlar', states: ['completed'] },
  { id: 'archived', label: 'Arşiv', states: ['archived'] },
];
export function ProjectsHub({ projects, workspaces, hasDraft, onNew, onOpen, onCopy }: { projects: Metric[]; workspaces: Record<string, ProjectWorkspaceData>; hasDraft: boolean; onNew: () => void; onOpen: (id: string) => void; onCopy: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('current');
  const lifecycle = (project: Metric['project']) => workspaces[project.id]?.planning?.lifecycle || lifecycleFromStage(project.stage);
  const matchesFilter = (item: Metric, value: string) => value === 'current' ? !['completed', 'archived'].includes(lifecycle(item.project)) : value === 'all' || lifecycle(item.project) === value;
  const visible = projects.filter(item => matchesFilter(item, filter) && `${item.project.title} ${item.project.tags.join(' ')} ${workspaces[item.project.id]?.description || ''}`.toLocaleLowerCase('tr').includes(query.trim().toLocaleLowerCase('tr')));
  return <div className="pp-root px-hub pb-hub">
    <header className="px-hub-heading"><div><span className="pp-kicker">FİKİRDEN UYGULAMAYA</span><h1>Projeler</h1><p>Bir proje seç, sıradaki işinden devam et.</p></div><button type="button" className="pp-button pp-primary" onClick={onNew}>{hasDraft ? <ArrowRight size={18}/> : <Plus size={18}/>} {hasDraft ? 'Taslağa devam et' : 'Yeni proje'}</button></header>
    <div className="px-hub-controls"><nav className="px-filters" aria-label="Proje görünümü">{[{ id: 'current', label: 'Devam eden' }, { id: 'completed', label: 'Tamamlanan' }, { id: 'all', label: 'Tümü' }].map(item => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{projects.filter(project => matchesFilter(project, item.id)).length}</span></button>)}</nav><label className="pp-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Proje ara…" aria-label="Projelerde ara"/>{query && <button type="button" aria-label="Aramayı temizle" onClick={() => setQuery('')}>×</button>}</label></div>
    {groups.map(group => {
      const items = visible.filter(({ project }) => group.states.includes(lifecycle(project)));
      if (!items.length) return null;
      return <section className="pb-project-group" key={group.id} aria-labelledby={`group-${group.id}`}><header><h2 id={`group-${group.id}`}>{group.label}</h2><span>{items.length}</span></header><div className="pb-project-index">{items.map(({ project, progress, done, total, nextAction }, index) => <article className="pb-project-entry" key={project.id}>
        <button type="button" className="pb-project-open" onClick={() => onOpen(project.id)} aria-label={`${project.title} projesini aç`}><span className="pb-project-number">{String(index + 1).padStart(2, '0')}</span><span className="pb-project-copy"><span className="pb-project-name">{project.title}</span><span className="pb-project-next">{nextAction || (total && done === total ? 'Görevler tamamlandı · sonucu gözden geçir' : 'İlk görevini ekle')}</span></span><span className="pb-project-meter"><span>{done}/{total} görev</span><progress max={100} value={progress} aria-label={`${project.title} ilerleme`}/></span><ArrowRight size={18}/></button>
        <div className="pb-project-entry-meta"><span className={`px-status px-status-${lifecycle(project)}`}>{lifecycleLabels[lifecycle(project)]}</span>{project.due && <span>{project.due}</span>}<button type="button" onClick={() => onCopy(project.id)} aria-label={`${project.title} proje bağlamını kopyala`} title="Proje bağlamını kopyala"><ClipboardCopy size={15}/></button></div>
      </article>)}</div></section>;
    })}
    {!visible.length && <section className="pp-empty"><FolderOpen size={30}/><h2>{query ? 'Aradığın proje bulunamadı.' : filter === 'completed' ? 'Henüz tamamlanan proje yok.' : 'Yeni bir başlangıca yer var.'}</h2><p>{query ? 'Proje adı veya etiketle tekrar ara.' : 'Projelerini burada bulabilir, tek bir adımla çalışmaya başlayabilirsin.'}</p>{projects.length ? <button type="button" className="pp-button" onClick={() => { setQuery(''); setFilter('all'); }}>Tüm projeleri göster</button> : <button type="button" className="pp-button pp-primary" onClick={onNew}>İlk projeni ekle <Plus size={17}/></button>}</section>}
  </div>;
}
