'use client';

/* Private images require the visitor's session; do not proxy them through an image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useDismissOnBack, useNavigationState } from '../use-navigation';
import './project-workspace.css';
import './project-experience.css';
import './project-workbench.css';
import { ArrowLeft, Settings2, Compass, CalendarDays, Check, ChevronDown, ClipboardCopy, ExternalLink, ImagePlus, LayoutList, Link2, Network, Pencil, Plus, StickyNote, Trash2, X, MessageSquare, Paperclip } from 'lucide-react';
import { ProjectOverview } from './project-overview';
import { lifecycleFromStage, lifecycleLabels } from './planning-types';
import type { ProjectLifecycle } from './planning-types';
import { DiagramEditor } from './diagram-editor';
import { PhotoAnnotator } from './photo-annotator';
import { ProjectNotebook } from './project-notebook';
import { buildProjectTasks, emptyTask, safeResourceUrl } from './project-types';
import type { Diagram, ProjectPhoto, ProjectTaskDetails, ProjectTaskEntry, ProjectWorkspaceData } from './project-types';
import { taskCopyText } from '../task-copy';

type Props = {
  project: { id: string; title: string; stage: number; due: string; tags: string[] };
  tasks: (string | ProjectTaskEntry)[];
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
  onCopyContext: () => void;
  onCopyTask: (text: string, photos?: ProjectPhoto[]) => void;
  onCopyPhoto: (photo: ProjectPhoto) => void;
  onStage: (stage: number) => void;
  onToggle: (id: string) => void;
  onSchedule: (title: string) => void;
  onAddTask: (title: string) => void;
  onEditTask: (index: number, title: string) => void;
  onRemoveTask: (index: number) => void;
  onAddSubtask: (index: number, title: string) => void;
  onEditSubtask: (index: number, task: { id: string; title: string }) => void;
  onRemoveSubtask: (index: number, task: { id: string; title: string }) => void;
  onDetails: (id: string, update: (current: ProjectTaskDetails) => ProjectTaskDetails) => void;
  onWorkspace: (update: (current: ProjectWorkspaceData) => ProjectWorkspaceData) => void;
};

function AddLine({ label, onAdd, autoFocus=false }: { label: string; onAdd: (title: string) => void; autoFocus?: boolean }) {
  const [value, setValue] = useState('');
  return <form className="pw-add-line" onSubmit={event => { event.preventDefault(); if (value.trim()) { onAdd(value.trim()); setValue(''); } }}><Plus size={17}/><input autoFocus={autoFocus} aria-label={label} maxLength={240} placeholder={label} value={value} onChange={event => setValue(event.target.value)}/><button disabled={!value.trim()}>Ekle</button></form>;
}

function WorkspaceDrawer({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const dialog=ref.current,previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    dialog?.showModal();document.body.style.overflow='hidden';dialog?.querySelector<HTMLElement>('h2')?.focus();
    return()=>{dialog?.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <dialog ref={ref} className="pb-drawer" aria-label={title} onCancel={event=>{event.preventDefault();onClose();}} onMouseDown={event=>{const rect=event.currentTarget.getBoundingClientRect();if(event.target===event.currentTarget&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))onClose();}}>
    <header className="pb-drawer-header"><span>PROJE ÇALIŞMA ALANI</span><button type="button" aria-label="Paneli kapat" onClick={onClose}><X size={20}/></button><h2 tabIndex={-1}>{title}</h2></header>
    <div className="pb-drawer-content">{children}</div>
  </dialog>;
}

export function ProjectWorkspace(props: Props) {
  const { project, workspace, completed } = props;
  const [tab, setTab] = useNavigationState<'overview' | 'tasks' | 'diagrams' | 'resources'>(`project:${project.id}:tab`, 'tasks');
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open');
  const [expandedDiagram, setExpandedDiagram] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [adding,setAdding]=useState(false),[settings,setSettings]=useState(false);
  const [editor, setEditor] = useState<{ taskId: string; source: string; name: string; previousId?: string; temporary?: boolean } | null>(null);
  useDismissOnBack('photo-editor', !!editor, () => setEditor(null));
  const [error, setError] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const tasks = buildProjectTasks(project.id, props.tasks, props.subtasks);
  const allIds = tasks.flatMap(task => [task.id, ...task.children.map(child => child.id)]);
  const done = allIds.filter(id => completed[id]).length;
  const progress = allIds.length ? Math.round(done / allIds.length * 100) : 0;
  const visibleTasks = tasks.filter(task => filter === 'all' || (filter === 'done' ? completed[task.id] : !completed[task.id] || task.children.some(child => !completed[child.id])));
  const nextTask = tasks.flatMap(task => [...task.children.map(child => ({...child, parentId: task.id})), {...task, parentId: task.id}]).find(task => !completed[task.id]);
  const selectedTask=tasks.find(task=>task.id===expandedTask);
  useDismissOnBack('project-task',!!selectedTask,()=>setExpandedTask(null));
  useDismissOnBack('project-info',settings,()=>setSettings(false));
  const lifecycle = workspace.planning?.lifecycle || lifecycleFromStage(project.stage);
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
    setExpandedDiagram(id);
  };
  return <div className="project-workspace pw-redesign">
    <div className="pw-topbar"><button type="button" onClick={props.onBack}><ArrowLeft size={17}/> Projeler</button><span className={`pw-sync ${props.syncStatus === 'error' ? 'pw-error' : ''}`} role="status">{props.syncStatus === 'saved' ? 'Kaydedildi' : props.syncStatus === 'saving' ? 'Kaydediliyor…' : props.syncStatus === 'error' ? 'Kaydedilemedi' : 'Yükleniyor…'}</span>{props.syncStatus === 'error' && <button type="button" onClick={props.onRetry}>Tekrar dene</button>}</div>
    <header className="pb-project-header">
      <div className="pb-project-title"><span className={`px-status px-status-${lifecycle}`}>{lifecycleLabels[lifecycle]}</span><h1>{project.title}</h1>{workspace.description&&<p>{workspace.description}</p>}</div>
      <div className="pb-project-meta"><span>{done}/{allIds.length} adım tamamlandı</span><progress max={100} value={progress} aria-label="Proje ilerlemesi"/><button type="button" className="pb-subtle" onClick={()=>setSettings(true)}><Settings2 size={16}/> Proje bilgileri</button></div>
    </header>
    <nav className="pw-tabs" aria-label="Proje bölümleri"><button type="button" aria-current={tab === 'tasks' ? 'page' : undefined} onClick={() => setTab('tasks')}><LayoutList size={17}/> Görevler <span>{tasks.length}</span></button><button type="button" aria-current={tab === 'overview' ? 'page' : undefined} onClick={() => setTab('overview')}><Compass size={17}/> Plan</button><button type="button" aria-current={tab === 'resources' ? 'page' : undefined} onClick={() => setTab('resources')}><StickyNote size={17}/> Notlar <span>{workspace.notes.length + workspace.links.length}</span></button><button type="button" aria-current={tab === 'diagrams' ? 'page' : undefined} onClick={() => setTab('diagrams')}><Network size={17}/> Akışlar <span>{workspace.diagrams.length}</span></button></nav>
    {error && <p className="pw-error" role="alert">{error}</p>}
    {tab === 'overview' && <ProjectOverview plan={workspace.planning} tasks={props.tasks.map(task => typeof task === 'string' ? task : task.title)} onPlan={props.onPlan} onResearch={props.onResearch} onTask={props.onAddTask} onCopyTask={title=>props.onCopyTask(taskCopyText({title,context:`Proje · ${project.title}`}))} onChange={planning => props.onWorkspace(current => ({ ...current, planning }))}/>}
    {tab === 'tasks' && <section className="pb-task-board">
      <div className="pb-board-toolbar"><nav className="pb-filters" aria-label="Görev görünümü">{([{id:'open',label:'Yapılacak'},{id:'done',label:'Biten'},{id:'all',label:'Tümü'}] as const).map(item=><button type="button" key={item.id} aria-pressed={filter===item.id} onClick={()=>setFilter(item.id)}>{item.label}<span>{item.id==='all'?tasks.length:tasks.filter(task=>item.id==='done'?completed[task.id]:!completed[task.id]||task.children.some(child=>!completed[child.id])).length}</span></button>)}</nav><button type="button" className="pb-action" aria-expanded={adding} onClick={()=>setAdding(!adding)}>{adding?<X size={16}/>:<Plus size={16}/>} {adding?'Vazgeç':'Görev ekle'}</button></div>
      {adding&&<div className="pb-task-composer"><AddLine autoFocus label="Yeni görevin adı" onAdd={title=>{props.onAddTask(title);setFilter('open');setAdding(false);}}/></div>}
      <div className="pb-list-heading"><h2>Görevler</h2><span>{visibleTasks.length} görev</span></div>
      <div className="pb-task-list">{visibleTasks.map(task=>{
        const details=props.details[task.id]??emptyTask;
        const childDone=task.children.filter(child=>completed[child.id]).length;
        return <article className={`pb-task-row ${completed[task.id]?'is-done':''}`} key={task.id} id={`row-${task.id}`}>
          <button type="button" className={`pw-check ${completed[task.id]?'checked':''}`} aria-label={`${task.title}: ${completed[task.id]?'yeniden aç':'tamamla'}`} aria-pressed={!!completed[task.id]} onClick={()=>props.onToggle(task.id)}>{completed[task.id]&&<Check size={14}/>}</button>
          <button type="button" className="pb-row-open" aria-haspopup="dialog" onClick={()=>setExpandedTask(task.id)}><span className="pb-row-title">{task.title}</span><span className="pb-row-meta">{nextTask?.parentId===task.id&&!completed[task.id]&&<span className="pb-next-label">Sıradaki</span>}{task.children.length>0&&<span>{childDone}/{task.children.length} alt görev</span>}{details.note&&<MessageSquare size={13} aria-label="Not var"/>}{details.photos.length>0&&<span><Paperclip size={13}/>{details.photos.length}</span>}</span><ChevronDown size={16} className="pb-row-arrow"/></button>
        </article>;
      })}{!visibleTasks.length&&<div className="pb-empty"><LayoutList size={26}/><h3>{tasks.length?'Bu görünümde görev yok.':'İlk görevini ekle.'}</h3><p>{tasks.length?'Başka bir filtre seçebilir veya yeni bir görev ekleyebilirsin.':'Küçük, net bir adımla başla.'}</p><button type="button" className="pb-subtle" onClick={()=>setAdding(true)}><Plus size={16}/> Görev ekle</button></div>}</div>
    </section>}
    {selectedTask&&<WorkspaceDrawer key={selectedTask.id} title={selectedTask.title} onClose={()=>setExpandedTask(null)}>{(()=>{const task=selectedTask,details=props.details[task.id]??emptyTask;return <div className="pw-task-content pb-task-editor"><div className="pb-task-status"><span>{completed[task.id]?'Tamamlandı':'Yapılacak'}</span><button type="button" className={completed[task.id]?'pb-subtle':'pb-action'} onClick={()=>props.onToggle(task.id)}><Check size={16}/>{completed[task.id]?'Yeniden aç':'Görevi tamamla'}</button></div><label>Görev notu<textarea maxLength={5000} rows={5} placeholder="Bu görev için bilmen gerekenler…" value={details.note} onChange={event => props.onDetails(task.id, current => ({ ...current, note: event.target.value }))}/></label><h3 className="pb-field-heading">Alt görevler <span>{task.children.length}</span></h3>
            {task.children.map(child => <div className="pw-child" key={child.id}><button type="button" className={`pw-check ${completed[child.id] ? 'checked' : ''}`} aria-label={`${child.title}: tamamlanma durumunu değiştir`} aria-pressed={!!completed[child.id]} onClick={() => props.onToggle(child.id)}>{completed[child.id] && <Check size={13}/>}</button><span className={completed[child.id] ? 'pw-done' : ''}>{child.title}</span><button type="button" title="Kopyala" aria-label={`${child.title} alt görevini kopyala`} onClick={() => props.onCopyTask(taskCopyText({title:child.title,context:`Proje · ${project.title} · ${task.title}`,status:completed[child.id]?'Tamamlandı':'Açık'}))}><ClipboardCopy size={14}/></button><button type="button" aria-label={`${child.title} alt görevini takvime ekle`} onClick={() => {setExpandedTask(null);props.onSchedule(child.title);}}><CalendarDays size={14}/></button>{!child.legacy && <><button type="button" title="Alt görevi düzenle" aria-label={`${child.title} alt görevini düzenle`} onClick={() => {setExpandedTask(null);props.onEditSubtask(task.index, child);}}><Pencil size={14}/></button><button type="button" title="Alt görevi sil" aria-label={`${child.title} alt görevini sil`} onClick={() => {setExpandedTask(null);props.onRemoveSubtask(task.index, child);}}><Trash2 size={14}/></button></>}</div>)}
            <AddLine label="Bu görevin altına alt görev ekle…" onAdd={title => props.onAddSubtask(task.index, title)}/>

            <details className="pb-task-media"><summary><Paperclip size={16}/> Görseller <span>{details.photos.length}</span></summary><div className="pw-photo-grid">{details.photos.map(photo => <figure key={photo.id}><button type="button" aria-label={`${photo.name} fotoğrafını aç ve işaretle`} onClick={() => setEditor({ taskId: task.id, source: photo.url, name: photo.name, previousId: photo.id })}>{/* Private authenticated media; do not proxy through Next image optimization. */}<img src={photo.url} alt={photo.name} loading="lazy"/><span><Pencil size={14}/> Aç ve işaretle</span></button><figcaption><span>{photo.name}</span><button type="button" title="Görseli kopyala" aria-label={`${photo.name} görselini kopyala`} onClick={() => props.onCopyPhoto(photo)}><ClipboardCopy size={14}/></button><button type="button" title="Görevden kaldır" aria-label={`${photo.name} fotoğrafını görevden kaldır`} onClick={() => { if (window.confirm('Bu fotoğrafın görev bağlantısı kaldırılsın mı?')) props.onDetails(task.id, current => ({ ...current, photos: current.photos.filter(item => item.id !== photo.id) })); }}><Trash2 size={14}/></button></figcaption></figure>)}</div>
            <label className="pw-upload"><ImagePlus size={18}/> Fotoğraf ekle ve işaretle<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`${task.title} görevine fotoğraf ekle`} onChange={event => {
              const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
              if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('En fazla 10 MB boyutunda JPG, PNG veya WebP seç.'); return; }
              if (details.photos.length >= 20) { setError('Bir görevde en fazla 20 fotoğraf saklayabilirsin.'); return; }
              setError(''); setEditor({ taskId: task.id, source: URL.createObjectURL(file), name: file.name, temporary: true });
            }}/></label><small className="pw-hint">JPG, PNG, WebP · En fazla 10 MB · Kalemle çiz veya doğrudan kaydet.</small></details><div className="pb-task-tools"><button type="button" title={details.photos.length?'Görev ve görselleri kopyala':'Görevi kopyala'} aria-label={`${task.title} görevini${details.photos.length?' ve görsellerini':''} kopyala`} onClick={() => props.onCopyTask(taskCopyText({title:task.title,context:`Proje · ${project.title}`,status:completed[task.id]?'Tamamlandı':'Açık',note:details.note,subtasks:task.children.map(child=>({title:child.title,completed:!!completed[child.id]}))}), details.photos)}><ClipboardCopy size={17}/> Kopyala</button><button type="button" title="Takvime ekle" aria-label={`${task.title} görevini takvime ekle`} onClick={() => {setExpandedTask(null);props.onSchedule(task.title);}}><CalendarDays size={17}/> Takvime ekle</button><button type="button" title="Görevi düzenle" aria-label={`${task.title} görevini düzenle`} onClick={() => {setExpandedTask(null);props.onEditTask(task.index, task.title);}}><Pencil size={17}/> Düzenle</button><button type="button" className="pw-task-delete" title="Görevi sil" aria-label={`${task.title} görevini sil`} onClick={() => {setExpandedTask(null);props.onRemoveTask(task.index);}}><Trash2 size={17}/> Sil</button></div>
          </div>;})()}</WorkspaceDrawer>}
    {settings&&<WorkspaceDrawer title="Proje bilgileri" onClose={()=>setSettings(false)}><div className="pb-info-fields"><label>Projenin amacı<textarea maxLength={3000} rows={3} value={workspace.description} onChange={event => props.onWorkspace(current => ({ ...current, description: event.target.value }))} placeholder="Ne yapıyoruz, kimin için?"/></label><label>Durum{workspace.planning ? <select value={workspace.planning.lifecycle} onChange={event => props.onWorkspace(current => current.planning ? { ...current, planning: { ...current.planning, lifecycle: event.target.value as ProjectLifecycle, updatedAt: new Date().toISOString() } } : current)}>{Object.entries(lifecycleLabels).map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select> : <select value={project.stage} onChange={event => props.onStage(Number(event.target.value))}>{['Fikirler', 'Devam ediyor', 'İnceleme', 'Tamamlandı'].map((stage, index) => <option value={index} key={stage}>{stage}</option>)}</select>}</label><div className="pw-meta"><span>{project.due}</span>{project.tags.map(tag => <span key={tag}>{tag}</span>)}</div><button type="button" onClick={()=>{setSettings(false);props.onEdit();}}><Pencil size={15}/> Adı ve bilgileri düzenle</button><button type="button" onClick={props.onCopyContext}><ClipboardCopy size={15}/> Proje bağlamını kopyala</button></div></WorkspaceDrawer>}
    {tab === 'diagrams' && <section><div className="pw-section-heading"><div><h2>Akışlar</h2><p>Ekran akışı, yol haritası ya da sistem taslağı.</p></div><div className="pw-toolbar"><button type="button" onClick={() => addDiagram(true)}><Network size={16}/> Akış şablonu</button><button type="button" onClick={() => addDiagram(false)}><Plus size={16}/> Boş diyagram</button></div></div>{!workspace.diagrams.length && <div className="surface pw-empty"><Network size={30}/><h3>Projenin haritasını çıkar.</h3><p>Boş bir tuval aç veya dört adımlı akış şablonuyla başla.</p></div>}{workspace.diagrams.map(diagram => <details className="surface pw-diagram px-diagram" key={diagram.id} open={expandedDiagram===diagram.id} onToggle={event=>{const open=event.currentTarget.open;setExpandedDiagram(current=>open?diagram.id:current===diagram.id?null:current);}}><summary><Network size={18}/><span>{diagram.title}</span><ChevronDown size={17}/></summary><DiagramEditor diagram={diagram} onChange={value => props.onWorkspace(current => ({ ...current, diagrams: current.diagrams.map(item => item.id === diagram.id ? value : item) }))}/><button type="button" className="pw-delete" onClick={() => { if (window.confirm('Bu diyagram silinsin mi?')) props.onWorkspace(current => ({ ...current, diagrams: current.diagrams.filter(item => item.id !== diagram.id) })); }}><Trash2 size={15}/> Diyagramı sil</button></details>)}</section>}
    {tab === 'resources' && <div className="pw-resource-grid"><ProjectNotebook workspace={workspace} onChange={props.onWorkspace} onError={setError}/><section className="surface pw-resource"><h2>Bağlantılar</h2><p>Projenin dosyaları, tasarımları ve referansları.</p><details className="px-link-add"><summary><Plus size={16}/> Bağlantı ekle</summary><form className="pw-link-form" onSubmit={event => { event.preventDefault(); const url = safeResourceUrl(linkUrl); if (!url) { setError('https:// veya http:// ile başlayan geçerli bir bağlantı gir.'); return; } props.onWorkspace(current => ({ ...current, links: [...current.links, { id: crypto.randomUUID(), title: linkTitle.trim() || new URL(url).hostname, url }] })); setLinkTitle(''); setLinkUrl(''); setError(''); }}><label>Başlık<input maxLength={160} value={linkTitle} onChange={event => setLinkTitle(event.target.value)} placeholder="Örn. Figma tasarımları"/></label><label>Bağlantı<input type="url" required maxLength={2000} value={linkUrl} onChange={event => setLinkUrl(event.target.value)} placeholder="https://…"/></label><button><Link2 size={16}/> Bağlantıyı kaydet</button></form></details>{workspace.links.map(link => <div className="pw-resource-link" key={link.id}><a href={safeResourceUrl(link.url) ?? undefined} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/><span><strong>{link.title}</strong><small>{link.url}</small></span></a><button type="button" aria-label={`${link.title} bağlantısını kaldır`} onClick={() => { if (window.confirm('Bu bağlantı kaldırılsın mı?')) props.onWorkspace(current => ({ ...current, links: current.links.filter(item => item.id !== link.id) })); }}><Trash2 size={14}/></button></div>)}</section></div>}
    {editor && <PhotoAnnotator key={editor.source} source={editor.source} name={editor.name} onClose={() => setEditor(null)} onSave={upload}/>}
  </div>;
}
