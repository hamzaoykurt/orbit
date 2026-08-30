'use client';
import { useState } from 'react';
import { ArrowUpRight, Plus, Search, Lightbulb, ArrowRight, Layers } from 'lucide-react';
import type { ProjectWorkspaceData } from './project-types';
import { lifecycleFromStage, lifecycleLabels } from './planning-types';
import type { ProjectLifecycle } from './planning-types';
import { findDesignStyle } from './design-catalog';
import { DesignPreview } from './design-preview';
import './project-planning.css';

type Metric={project:{id:string;title:string;stage:number;due:string;tags:string[]};progress:number;done:number;total:number};
export function ProjectsHub({projects,workspaces,hasDraft,onNew,onOpen}:{projects:Metric[];workspaces:Record<string,ProjectWorkspaceData>;hasDraft:boolean;onNew:()=>void;onOpen:(id:string)=>void}) {
  const [query,setQuery]=useState(''),[filter,setFilter]=useState<ProjectLifecycle|'all'>('all');
  const lifecycle=(project:Metric['project'])=>workspaces[project.id]?.planning?.lifecycle||lifecycleFromStage(project.stage);
  const visible=projects.filter(({project})=>(filter==='all'?lifecycle(project)!=='archived':lifecycle(project)===filter)&&`${project.title} ${project.tags.join(' ')} ${workspaces[project.id]?.description||''}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')));
  const active=projects.filter(({project})=>['active','mvp'].includes(lifecycle(project))).length;
  return <div className="pp-root pp-hub"><header className="pp-hub-header"><div><span className="pp-kicker">KİŞİSEL PROJE ATÖLYEN</span><h1>Bir fikir. Gerçek bir başlangıç.</h1><p>Fikrini netleştir, karakterini bul, ilk denemeni yap.</p></div><button type="button" className="pp-button pp-primary" onClick={onNew}>{hasDraft?<ArrowRight size={18}/>:<Plus size={18}/>} {hasDraft?'Taslağa devam et':'Yeni proje'}</button></header>
    <section className="pp-hub-intro"><div className="pp-intro-symbol" aria-hidden="true"><Layers size={28}/></div><div><strong>Henüz bütün planı bilmen gerekmiyor.</strong><p>Kısa seçimler → sana uygun görsel dil → uygulanabilir ilk üç adım.</p></div><span><b>{active}</b> proje üretimde</span></section>
    <div className="pp-hub-toolbar"><label className="pp-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Projelerinde ara" aria-label="Projelerde ara"/>{query&&<button type="button" aria-label="Aramayı temizle" onClick={()=>setQuery('')}>×</button>}</label><span>{visible.length} proje</span></div>
    <nav className="pp-filters" aria-label="Projeleri durumuna göre filtrele"><button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>Tümü</button>{Object.entries(lifecycleLabels).map(([id,label])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>setFilter(id as ProjectLifecycle)}>{label}<span>{projects.filter(({project})=>lifecycle(project)===id).length}</span></button>)}</nav>
    <div className="pp-project-grid">{visible.map(({project,progress,done,total})=>{
      const workspace=workspaces[project.id],plan=workspace?.planning,style=findDesignStyle(plan?.selectedStyle);
      return <article className="pp-project-card" key={project.id}><button type="button" className="pp-project-open" onClick={()=>onOpen(project.id)} aria-label={`${project.title} projesini aç`}>
        <div className="pp-project-cover">{style?<DesignPreview style={style}/>:<div className="pp-unplanned-cover" aria-hidden="true"><span>{project.title.slice(0,1).toLocaleUpperCase('tr')}</span><i/><i/><small>PROJECT / {project.tags[0]||'STUDIO'}</small></div>}<span className="pp-project-stage">{lifecycleLabels[lifecycle(project)]}</span><i className="pp-open-arrow"><ArrowUpRight size={19}/></i></div>
        <div className="pp-project-copy"><h2>{project.title}</h2><p>{workspace?.description||'Fikrini netleştir; bu proje için bir yol ve görsel dil belirle.'}</p><div className="pp-card-meta"><span>{style?.name||'Görsel dil seçilmedi'}</span><span>{project.due}</span></div><progress max="100" value={progress} aria-label={`${project.title} ilerleme`}/><div className="pp-card-meta"><span>{done}/{total} adım</span><strong>{progress}%</strong></div></div>
      </button></article>;
    })}</div>
    {!visible.length&&<div className="pp-empty"><Lightbulb size={32}/><h2>{query?'Bu aramada proje bulunamadı.':'Burada yeni bir başlangıca yer var.'}</h2><p>{query?'Başka bir kelime veya durum filtresi dene.':'Bir fikir ekle; yolunu birlikte netleştirelim.'}</p><button type="button" className="pp-button" onClick={query?()=>{setQuery('');setFilter('all');}:onNew}>{query?'Filtreleri temizle':'Yeni proje'}</button></div>}
  </div>;
}
