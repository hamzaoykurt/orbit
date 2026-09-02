'use client';

/* Private images require the visitor's session; do not proxy them through an image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import './project-workspace.css';
import { ArrowLeft, CalendarDays, Check, ChevronDown, ExternalLink, ImagePlus, LayoutList, Link2, Network, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react';
import { ProjectOverview } from './project-overview';
import { lifecycleLabels } from './planning-types';
import type { ProjectLifecycle } from './planning-types';
import { DiagramEditor } from './diagram-editor';
import { PhotoAnnotator } from './photo-annotator';
import { ProjectNotebook } from './project-notebook';
import { buildProjectTasks, emptyTask, safeResourceUrl } from './project-types';
import type { Diagram, ProjectPhoto, ProjectTaskDetails, ProjectWorkspaceData } from './project-types';

type Props = {
  project: { id: string; title: string; stage: number; due: string; tags: string[] };
  tasks: string[];
  subtasks: Record<string, { id: string; title: string }[]>;
  completed: Record<string, boolean>;
  details: Record<string, ProjectTaskDetails>;
  workspace: ProjectWorkspaceData;
  syncStatus: string;
  onRetry: () => void;
  onBack: () => void;
  onEdit: () => void;
  onPlan: () => void;
  onResearch: () => void;
  onStage: (stage: number) => void;
  onToggle: (id: string) => void;
  onSchedule: (title: string) => void;
  onAddTask: (title: string) => void;
  onAddSubtask: (index: number, title: string) => void;
  onRemoveSubtask: (index: number, task: { id: string; title: string }) => void;
  onDetails: (id: string, update: (current: ProjectTaskDetails) => ProjectTaskDetails) => void;
  onWorkspace: (update: (current: ProjectWorkspaceData) => ProjectWorkspaceData) => void;
};

function AddLine({ label, onAdd }: { label: string; onAdd: (title: string) => void }) {
  const [value, setValue] = useState('');
  return <form className="pw-add-line" onSubmit={event => { event.preventDefault(); if (value.trim()) { onAdd(value.trim()); setValue(''); } }}><Plus size={17}/><input aria-label={label} maxLength={240} placeholder={label} value={value} onChange={event => setValue(event.target.value)}/><button disabled={!value.trim()}>Ekle</button></form>;
}

export function ProjectWorkspace(props: Props) {
  const { project, workspace, completed } = props;
  const [tab, setTab] = useState<'overview' | 'tasks' | 'diagrams' | 'resources'>('overview');
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const [editor, setEditor] = useState<{ taskId: string; source: string; name: string; previousId?: string; temporary?: boolean } | null>(null);
  const [error, setError] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const tasks = buildProjectTasks(project.id, props.tasks, props.subtasks);
  const allIds = tasks.flatMap(task => [task.id, ...task.children.map(child => child.id)]);
  const done = allIds.filter(id => completed[id]).length;
  const progress = allIds.length ? Math.round(done / allIds.length * 100) : 0;
  const visibleTasks = tasks.filter(task => filter === 'all' || (filter === 'done' ? completed[task.id] : !completed[task.id] || task.children.some(child => !completed[child.id])));
  useEffect(() => { return () => { if (editor?.temporary) URL.revokeObjectURL(editor.source); }; }, [editor]);

  const upload = async (blob: Blob) => {
    if (!editor) return;
    const response = await fetch('/api/project-media', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, signal: AbortSignal.timeout(60000) });
    const data = await response.json() as ProjectPhoto & { error?: string };
    if (!response.ok || !data.id || !data.url) throw new Error(data.error || 'Fotoğraf yüklenemedi. Tekrar dene.');
    const photo: ProjectPhoto = { id: data.id, url: data.url, createdAt: data.createdAt, name: editor.name.replace(/\.[^.]+$/, '') + '.jpg' };
    props.onDetails(editor.taskId, current => ({ ...current, photos: editor.previousId ? current.photos.map(item => item.id === editor.previousId ? photo : item) : [...current.photos, photo] }));
  };
  const addDiagram = (template: boolean) => {
    const id = crypto.randomUUID();
    const nodes = template ? ['Fikir', 'Prototip', 'Test', 'Yayın'].map((label, index) => ({ id: crypto.randomUUID(), label, x: 30 + index * 245, y: 245, color: index === 3 ? 'mint' : 'violet' })) : [];
    const diagram: Diagram = { id, title: template ? 'Proje akışı' : 'Yeni diyagram', nodes, edges: nodes.slice(1).map((node, index) => ({ id: crypto.randomUUID(), from: nodes[index].id, to: node.id })) };
    props.onWorkspace(current => ({ ...current, diagrams: [...current.diagrams, diagram] }));
  };
  return <div className="project-workspace">
    <div className="pw-topbar"><button type="button" onClick={props.onBack}><ArrowLeft size={17}/> Proje panosu</button><span className={`pw-sync ${props.syncStatus === 'error' ? 'pw-error' : ''}`} role="status">{props.syncStatus === 'saved' ? 'Değişiklikler kaydedildi' : props.syncStatus === 'saving' ? 'Kaydediliyor…' : props.syncStatus === 'error' ? 'Sunucuya kaydedilemedi' : 'Veriler yükleniyor…'}</span>{props.syncStatus === 'error' && <button type="button" onClick={props.onRetry}>Tekrar dene</button>}</div>
    <header className="surface pw-header"><div className="pw-header-main"><span className="eyebrow">PROJE ÇALIŞMA ALANI</span><h1>{project.title}</h1><div className="pw-meta"><span><CalendarDays size={15}/>{project.due}</span>{project.tags.map(tag => <span key={tag}>{tag}</span>)}</div><label className="pw-description">Projenin amacı<textarea maxLength={3000} rows={2} value={workspace.description} onChange={event => props.onWorkspace(current => ({ ...current, description: event.target.value }))} placeholder="Ne yapıyoruz, kimin için ve başarı nasıl görünecek?"/></label></div><div className="pw-header-aside"><label>Projenin aşaması{workspace.planning ? <select value={workspace.planning.lifecycle} onChange={event => props.onWorkspace(current => current.planning ? { ...current, planning: { ...current.planning, lifecycle: event.target.value as ProjectLifecycle, updatedAt: new Date().toISOString() } } : current)}>{Object.entries(lifecycleLabels).map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select> : <select value={project.stage} onChange={event => props.onStage(Number(event.target.value))}>{['Fikirler', 'Devam ediyor', 'İnceleme', 'Tamamlandı'].map((stage, index) => <option value={index} key={stage}>{stage}</option>)}</select>}</label><div className="pw-progress"><strong>{progress}%</strong><span>{done} / {allIds.length} görev ve alt görev</span><progress max="100" value={progress}/></div><button type="button" onClick={props.onEdit}><Pencil size={15}/> Proje bilgilerini düzenle</button></div></header>
    <nav className="pw-tabs" aria-label="Proje bölümleri"><button type="button" aria-current={tab === 'overview' ? 'page' : undefined} onClick={() => setTab('overview')}><LayoutList size={17}/> Genel bakış</button><button type="button" aria-current={tab === 'tasks' ? 'page' : undefined} onClick={() => setTab('tasks')}><LayoutList size={17}/> Görevler <span>{tasks.length}</span></button><button type="button" aria-current={tab === 'diagrams' ? 'page' : undefined} onClick={() => setTab('diagrams')}><Network size={17}/> Diyagramlar <span>{workspace.diagrams.length}</span></button><button type="button" aria-current={tab === 'resources' ? 'page' : undefined} onClick={() => setTab('resources')}><StickyNote size={17}/> Notlar ve bağlantılar <span>{workspace.notes.length + workspace.links.length}</span></button></nav>
    {error && <p className="pw-error" role="alert">{error}</p>}
    {tab === 'overview' && <ProjectOverview plan={workspace.planning} tasks={props.tasks} nextAction={tasks.flatMap(task => [...task.children,task]).find(task => !completed[task.id])?.title} onTasks={()=>setTab('tasks')} onPlan={props.onPlan} onResearch={props.onResearch} onTask={props.onAddTask} onChange={planning => props.onWorkspace(current => ({ ...current, planning }))}/>}
    {tab === 'tasks' && <section className="pw-task-section"><div className="pw-section-heading"><div><h2>Bir sonraki adım.</h2><p>Görev aç, küçük adımlara böl, görselle anlat.</p></div><label>Görünüm<select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">Tüm görevler</option><option value="open">Açık işler</option><option value="done">Tamamlananlar</option></select></label></div><AddLine label="Projeye yeni görev ekle…" onAdd={title => { props.onAddTask(title); setFilter('all'); }}/>
      <div className="pw-task-list">{visibleTasks.map(task => {
        const details = props.details[task.id] ?? emptyTask;
        return <article className="surface pw-task" key={task.id}><div className="pw-task-title"><button type="button" className={`pw-check ${completed[task.id] ? 'checked' : ''}`} aria-label={`${task.title}: ${completed[task.id] ? 'yeniden aç' : 'tamamla'}`} aria-pressed={!!completed[task.id]} onClick={() => props.onToggle(task.id)}>{completed[task.id] && <Check size={15}/>}</button><h3 className={completed[task.id] ? 'pw-done' : ''}>{task.title}</h3><button type="button" title="Takvime ekle" aria-label={`${task.title} görevini takvime ekle`} onClick={() => props.onSchedule(task.title)}><CalendarDays size={17}/></button></div>
          <details className="pw-task-body"><summary><span>{task.children.length ? `${task.children.filter(child => completed[child.id]).length}/${task.children.length} alt görev` : 'Alt görev ekle'} · {details.photos.length ? `${details.photos.length} fotoğraf` : 'Fotoğraf ve not ekle'}</span><ChevronDown size={16}/></summary><div className="pw-task-content">
            {task.children.map(child => <div className="pw-child" key={child.id}><button type="button" className={`pw-check ${completed[child.id] ? 'checked' : ''}`} aria-label={`${child.title}: tamamlanma durumunu değiştir`} aria-pressed={!!completed[child.id]} onClick={() => props.onToggle(child.id)}>{completed[child.id] && <Check size={13}/>}</button><span className={completed[child.id] ? 'pw-done' : ''}>{child.title}</span><button type="button" aria-label={`${child.title} alt görevini takvime ekle`} onClick={() => props.onSchedule(child.title)}><CalendarDays size={14}/></button>{!child.legacy && <button type="button" aria-label={`${child.title} alt görevini sil`} onClick={() => { if (window.confirm('Bu alt görev silinsin mi?')) props.onRemoveSubtask(task.index, child); }}><Trash2 size={14}/></button>}</div>)}
            <AddLine label="Bu görevin altına alt görev ekle…" onAdd={title => props.onAddSubtask(task.index, title)}/>
            <label>Görev notu<textarea maxLength={5000} rows={3} placeholder="Bağlam, kararlar, yapılacak değişiklik…" value={details.note} onChange={event => props.onDetails(task.id, current => ({ ...current, note: event.target.value }))}/></label>
            <div className="pw-photo-grid">{details.photos.map(photo => <figure key={photo.id}><button type="button" aria-label={`${photo.name} fotoğrafını aç ve işaretle`} onClick={() => setEditor({ taskId: task.id, source: photo.url, name: photo.name, previousId: photo.id })}>{/* User-uploaded, authenticated R2 image; do not proxy through Next image optimization. */}<img src={photo.url} alt={photo.name} loading="lazy"/><span><Pencil size={14}/> Aç ve işaretle</span></button><figcaption>{photo.name}<button type="button" aria-label={`${photo.name} fotoğrafını görevden kaldır`} onClick={() => { if (window.confirm('Bu fotoğrafın görev bağlantısı kaldırılsın mı?')) props.onDetails(task.id, current => ({ ...current, photos: current.photos.filter(item => item.id !== photo.id) })); }}><Trash2 size={14}/></button></figcaption></figure>)}</div>
            <label className="pw-upload"><ImagePlus size={18}/> Fotoğraf ekle ve işaretle<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`${task.title} görevine fotoğraf ekle`} onChange={event => {
              const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
              if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('En fazla 10 MB boyutunda JPG, PNG veya WebP seç.'); return; }
              if (details.photos.length >= 20) { setError('Bir görevde en fazla 20 fotoğraf saklayabilirsin.'); return; }
              setError(''); setEditor({ taskId: task.id, source: URL.createObjectURL(file), name: file.name, temporary: true });
            }}/></label><small className="pw-hint">JPG, PNG, WebP · En fazla 10 MB · Kalemle çiz veya doğrudan kaydet.</small>
          </div></details></article>;
      })}{!visibleTasks.length && <div className="surface pw-empty"><LayoutList size={28}/><h3>{tasks.length ? 'Bu görünümde görev yok.' : 'İlk adımı belirle.'}</h3><p>Yukarıdaki alana bir görev yazıp Enter’a bas.</p></div>}</div>
    </section>}
    {tab === 'diagrams' && <section><div className="pw-section-heading"><div><h2>Fikirlerini birbirine bağla.</h2><p>Ekran akışı, yol haritası ya da sistem taslağı.</p></div><div className="pw-toolbar"><button type="button" onClick={() => addDiagram(true)}><Network size={16}/> Akış şablonu</button><button type="button" onClick={() => addDiagram(false)}><Plus size={16}/> Boş diyagram</button></div></div>{!workspace.diagrams.length && <div className="surface pw-empty"><Network size={30}/><h3>Projenin haritasını çıkar.</h3><p>Boş bir tuval aç veya dört adımlı akış şablonuyla başla.</p></div>}{workspace.diagrams.map(diagram => <article className="surface pw-diagram" key={diagram.id}><DiagramEditor diagram={diagram} onChange={value => props.onWorkspace(current => ({ ...current, diagrams: current.diagrams.map(item => item.id === diagram.id ? value : item) }))}/><button type="button" className="pw-delete" onClick={() => { if (window.confirm('Bu diyagram silinsin mi?')) props.onWorkspace(current => ({ ...current, diagrams: current.diagrams.filter(item => item.id !== diagram.id) })); }}><Trash2 size={15}/> Diyagramı sil</button></article>)}</section>}
    {tab === 'resources' && <div className="pw-resource-grid"><ProjectNotebook workspace={workspace} onChange={props.onWorkspace} onError={setError}/><section className="surface pw-resource"><h2>Projenin genel bağlantı rafı</h2><p>Bir nota değil, projenin tamamına ait dosya ve referanslar.</p><form className="pw-link-form" onSubmit={event => { event.preventDefault(); const url = safeResourceUrl(linkUrl); if (!url) { setError('https:// veya http:// ile başlayan geçerli bir bağlantı gir.'); return; } props.onWorkspace(current => ({ ...current, links: [...current.links, { id: crypto.randomUUID(), title: linkTitle.trim() || new URL(url).hostname, url }] })); setLinkTitle(''); setLinkUrl(''); setError(''); }}><label>Başlık<input maxLength={160} value={linkTitle} onChange={event => setLinkTitle(event.target.value)} placeholder="Örn. Figma tasarımları"/></label><label>Bağlantı<input type="url" required maxLength={2000} value={linkUrl} onChange={event => setLinkUrl(event.target.value)} placeholder="https://…"/></label><button><Link2 size={16}/> Bağlantı ekle</button></form>{workspace.links.map(link => <div className="pw-resource-link" key={link.id}><a href={safeResourceUrl(link.url) ?? undefined} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/><span><strong>{link.title}</strong><small>{link.url}</small></span></a><button type="button" aria-label={`${link.title} bağlantısını kaldır`} onClick={() => { if (window.confirm('Bu bağlantı kaldırılsın mı?')) props.onWorkspace(current => ({ ...current, links: current.links.filter(item => item.id !== link.id) })); }}><Trash2 size={14}/></button></div>)}</section></div>}
    {editor && <PhotoAnnotator key={editor.source} source={editor.source} name={editor.name} onClose={() => setEditor(null)} onSave={upload}/>}
  </div>;
}
