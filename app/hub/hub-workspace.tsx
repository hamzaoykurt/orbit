'use client';

import { type ReactNode, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronUp, Clock3,
  Camera, Code2, Copy, ExternalLink, Filter, Globe2, Image as ImageIcon, MessageCircle,
  Layers3, Link2, LoaderCircle, PlaySquare, Plus, Search, Sparkles, Trash2, Workflow, X,
} from 'lucide-react';
import type { HubAnalysis, HubLink, HubPlatform, WorkflowCard } from './hub-model';
import { hubPromptRecipes, hubResources, workflowInfrastructure, workflowPhases } from './hub-model';
import './hub-workspace.css';

type HubTab = 'library' | 'workflow' | 'knowledge';
type OwnerFilter = 'all' | 'mine' | 'others';
type HubWorkspaceProps = {
  links: HubLink[];
  currentUser: string;
  onAdd: (link: HubLink) => void;
  onDelete: (id: string) => void;
};

const platformMeta: Record<HubPlatform, { label: string; icon: typeof Globe2 }> = {
  youtube: { label: 'YouTube', icon: PlaySquare },
  twitter: { label: 'X', icon: MessageCircle },
  github: { label: 'GitHub', icon: Code2 },
  instagram: { label: 'Instagram', icon: Camera },
  web: { label: 'Web', icon: Globe2 },
};

const safeUrl = (value: string) => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null; }
  catch { return null; }
};

const subscribeToClient = () => () => undefined;

function BodyPortal({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false);
  return isClient ? createPortal(children, document.body) : null;
}

const relativeTime = (value: string) => {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dk`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} sa`;
  return `${Math.floor(minutes / 1440)} gün`;
};

function LinkCard({ link, onDelete }: { link: HubLink; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [imageIndex, setImageIndex] = useState<number | null>(null);
  const PlatformIcon = platformMeta[link.platform].icon;
  const images = link.images.length ? link.images : link.thumbnailUrl ? [link.thumbnailUrl] : [];
  const externalUrl = safeUrl(link.url);
  let hostname = '';
  try { hostname = new URL(link.url).hostname.replace(/^www\./, ''); } catch { /* invalid URLs are rejected before save */ }

  return <article className={`hub-link-card platform-${link.platform}`}>
    {images.length > 0 && <button className={`hub-card-media media-${Math.min(images.length, 4)}`} onClick={() => setImageIndex(0)} aria-label={`${link.title} görselini büyüt`}>
      {images.slice(0, 4).map((image, index) => <span key={`${image}-${index}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        {index === 3 && images.length > 4 && <b>+{images.length - 4}</b>}
      </span>)}
    </button>}
    <div className="hub-link-body">
      <header>
        <div className="hub-badges"><span className="platform-badge"><PlatformIcon size={12}/>{platformMeta[link.platform].label}</span><span>{link.mainCategory}</span></div>
        <div className="hub-card-actions">
          {externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer" aria-label="Bağlantıyı aç"><ExternalLink size={15}/></a>}
          <button onClick={() => window.confirm('Bu bağlantı silinsin mi?') && onDelete()} aria-label="Bağlantıyı sil"><Trash2 size={15}/></button>
        </div>
      </header>
      <h2>{link.title}</h2>
      {link.summary && <><p className={!expanded ? 'hub-summary-clamped' : ''}>{link.summary}</p>{link.summary.length > 230 && <button className="hub-expand" onClick={() => setExpanded(current => !current)}>{expanded ? <><ChevronUp size={13}/> Daha az</> : <><ChevronDown size={13}/> Devamı</>}</button>}</>}
      {link.embedded.length > 0 && <div className="hub-embedded"><span><Link2 size={12}/>{link.embedded.length} bağlantı</span>{link.embedded.map((item, index) => <a key={`${item.url}-${index}`} href={safeUrl(item.url) ?? '#'} target="_blank" rel="noreferrer"><strong>{item.title}</strong><small>{item.summary}</small><ExternalLink size={12}/></a>)}</div>}
      {link.categories.length > 0 && <div className="hub-tags">{link.categories.map(tag => <span key={tag}>{tag}</span>)}</div>}
      <footer><span className="hub-owner">{link.addedBy.slice(0, 1).toLocaleUpperCase('tr')}</span><strong>{link.addedBy}</strong><span><Clock3 size={11}/>{relativeTime(link.createdAt)}</span><small>{hostname}</small></footer>
    </div>
    {imageIndex !== null && <BodyPortal><div className="hub-lightbox" role="dialog" aria-modal="true" aria-label="Görsel önizleme" onClick={() => setImageIndex(null)}>
      <button className="hub-lightbox-close" onClick={() => setImageIndex(null)} aria-label="Kapat"><X size={20}/></button>
      {images.length > 1 && <button className="hub-lightbox-nav previous" onClick={event => { event.stopPropagation(); setImageIndex((imageIndex - 1 + images.length) % images.length); }} aria-label="Önceki görsel"><ArrowLeft/></button>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[imageIndex]} alt="" onClick={event => event.stopPropagation()} />
      {images.length > 1 && <button className="hub-lightbox-nav next" onClick={event => { event.stopPropagation(); setImageIndex((imageIndex + 1) % images.length); }} aria-label="Sonraki görsel"><ArrowRight/></button>}
    </div></BodyPortal>}
  </article>;
}

function AddLinkDialog({ currentUser, onClose, onAdd }: { currentUser: string; onClose: () => void; onAdd: (link: HubLink) => void }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading'>('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    const normalized = safeUrl(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    if (!normalized) { setError('Geçerli bir web adresi gir.'); return; }
    setStatus('loading'); setError('');
    try {
      const response = await fetch('/api/hub/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: normalized }) });
      const payload = await response.json() as HubAnalysis & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Bağlantı analiz edilemedi.');
      onAdd({ ...payload, id: crypto.randomUUID(), addedBy: currentUser || 'Orbit', createdAt: new Date().toISOString() });
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Bağlantı analiz edilemedi.'); }
    finally { setStatus('idle'); }
  };

  return <BodyPortal><div className="hub-dialog-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="hub-dialog" role="dialog" aria-modal="true" aria-labelledby="hub-add-title">
      <button className="hub-dialog-close" onClick={onClose} aria-label="Kapat"><X size={18}/></button>
      <span className="hub-dialog-icon"><Link2 size={21}/></span><span className="eyebrow">AKILLI KAYIT</span>
      <h2 id="hub-add-title">Bağlantıyı Orbit’e bırak.</h2>
      <p>Başlık, Türkçe özet, kategori, görseller ve içerideki bağlantılar otomatik hazırlanır.</p>
      <label>Web adresi<input autoFocus value={url} onChange={event => setUrl(event.target.value)} onKeyDown={event => event.key === 'Enter' && status === 'idle' && void submit()} placeholder="youtube.com/… · x.com/… · github.com/…" /></label>
      {error && <div className="hub-dialog-error">{error}</div>}
      <button className="primary-button full" disabled={!url.trim() || status === 'loading'} onClick={() => void submit()}>{status === 'loading' ? <><LoaderCircle className="hub-spin" size={16}/> İçerik okunuyor…</> : <>Analiz et ve ekle <Sparkles size={15}/></>}</button>
    </section>
  </div></BodyPortal>;
}

function WorkflowDetail({ item, onClose }: { item: WorkflowCard; onClose: () => void }) {
  return <BodyPortal><div className="hub-dialog-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className={`hub-workflow-detail tone-${item.tone}`} role="dialog" aria-modal="true" aria-labelledby="workflow-detail-title">
      <button className="hub-dialog-close" onClick={onClose} aria-label="Kapat"><X size={18}/></button>
      <header><span>{item.index === undefined ? <Layers3 size={22}/> : String(item.index).padStart(2, '0')}</span><div><small>{item.timing}{item.role ? ` · ${item.role}` : ''}</small><h2 id="workflow-detail-title">{item.title}</h2><p>{item.description}</p></div></header>
      <div className="hub-detail-sections">{item.sections.map(section => <section key={section.title}><h3>{section.title}</h3>{section.text && <p>{section.text}</p>}{section.items && <div>{section.items.map(entry => entry.url ? <a href={entry.url} target="_blank" rel="noreferrer" key={entry.label}><strong>{entry.label}</strong>{entry.description && <small>{entry.description}</small>}<ExternalLink size={13}/></a> : <article key={entry.label}><i><Check size={12}/></i><span><strong>{entry.label}</strong>{entry.description && <small>{entry.description}</small>}</span></article>)}</div>}</section>)}</div>
    </section>
  </div></BodyPortal>;
}

function WorkflowView() {
  const [mode, setMode] = useState<'phases' | 'infrastructure'>('phases');
  const [selected, setSelected] = useState<WorkflowCard | null>(null);
  const items = mode === 'phases' ? workflowPhases : workflowInfrastructure;
  return <>
    <div className="hub-view-controls segmented-control"><button className={mode === 'phases' ? 'active' : ''} onClick={() => setMode('phases')}><Workflow size={14}/> Fazlar</button><button className={mode === 'infrastructure' ? 'active' : ''} onClick={() => setMode('infrastructure')}><Layers3 size={14}/> Altyapı</button></div>
    <div className={`hub-workflow-grid ${mode}`}>{items.map(item => <button key={item.id} className={`hub-workflow-card tone-${item.tone}`} onClick={() => setSelected(item)}>
      <span className="hub-workflow-number">{item.index === undefined ? <Layers3 size={25}/> : String(item.index).padStart(2, '0')}</span>
      <span className="hub-workflow-meta">{item.timing}{item.role && <b>{item.role}</b>}</span><strong>{item.title}</strong><p>{item.description}</p><span className="hub-workflow-open">Detayları aç <ArrowRight size={14}/></span>
    </button>)}</div>
    {selected && <WorkflowDetail item={selected} onClose={() => setSelected(null)}/>} 
  </>;
}

function KnowledgeView() {
  const [copied, setCopied] = useState('');
  const copy = async (title: string, prompt: string) => { await navigator.clipboard.writeText(prompt); setCopied(title); window.setTimeout(() => setCopied(''), 1600); };
  return <div className="hub-knowledge-layout">
    <section><div className="hub-prompt-grid">{hubPromptRecipes.map(recipe => <article key={recipe.title}><header><span>{recipe.phase}</span><button onClick={() => void copy(recipe.title, recipe.prompt)}>{copied === recipe.title ? <Check size={14}/> : <Copy size={14}/>} {copied === recipe.title ? 'Kopyalandı' : 'Kopyala'}</button></header><h3>{recipe.title}</h3><p>{recipe.description}</p><details><summary>Promptu göster <ChevronDown size={14}/></summary><pre>{recipe.prompt}</pre></details></article>)}</div></section>
    <aside className="hub-resource-panel"><h2>Kaynaklar</h2>{hubResources.map(group => <section key={group.group}><h3>{group.group}</h3><div>{group.links.map(link => <a key={link} href={`https://${link}`} target="_blank" rel="noreferrer">{link}<ExternalLink size={11}/></a>)}</div></section>)}</aside>
  </div>;
}

export function HubWorkspace({ links, currentUser, onAdd, onDelete }: HubWorkspaceProps) {
  const [tab, setTab] = useState<HubTab>('library');
  const [owner, setOwner] = useState<OwnerFilter>('all');
  const [category, setCategory] = useState('all');
  const [platform, setPlatform] = useState<'all' | HubPlatform>('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const categories = useMemo(() => Array.from(new Set(links.flatMap(link => [link.mainCategory, ...link.categories]).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'tr')), [links]);
  const filtered = useMemo(() => links.filter(link => {
    if (owner === 'mine' && link.addedBy.toLocaleLowerCase('tr') !== currentUser.toLocaleLowerCase('tr')) return false;
    if (owner === 'others' && link.addedBy.toLocaleLowerCase('tr') === currentUser.toLocaleLowerCase('tr')) return false;
    if (category !== 'all' && link.mainCategory !== category && !link.categories.includes(category)) return false;
    if (platform !== 'all' && link.platform !== platform) return false;
    const needle = search.trim().toLocaleLowerCase('tr');
    return !needle || `${link.title} ${link.summary} ${link.url} ${link.categories.join(' ')}`.toLocaleLowerCase('tr').includes(needle);
  }), [category, currentUser, links, owner, platform, search]);

  return <div className="hub-workspace">
    <div className="page-title hub-page-title"><div><h1>Hub</h1></div>{tab === 'library' && <button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={16}/> Bağlantı ekle</button>}</div>
    <nav className="hub-tabs" aria-label="Hub sekmeleri">{([
      ['library', 'Kütüphane', Link2], ['workflow', 'Workflow', Workflow], ['knowledge', 'Rehber', BookOpen],
    ] as const).map(([id, label, Icon]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={16}/><span>{label}</span>{id === 'library' && <em>{links.length}</em>}</button>)}</nav>

    {tab === 'library' && <>
      <section className="hub-library-toolbar">
        <label className="hub-search"><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Başlık, özet, adres veya etiket ara…"/>{search && <button onClick={() => setSearch('')} aria-label="Aramayı temizle"><X size={13}/></button>}</label>
        <div className="hub-owner-tabs">{(['all', 'mine', 'others'] as const).map(item => <button key={item} className={owner === item ? 'active' : ''} onClick={() => setOwner(item)}>{item === 'all' ? 'Tümü' : item === 'mine' ? 'Benim' : 'Diğer'}</button>)}</div>
        <button className={`hub-filter-trigger ${filtersOpen ? 'active' : ''}`} onClick={() => setFiltersOpen(current => !current)}><Filter size={14}/> Filtreler</button>
      </section>
      {filtersOpen && <section className="hub-filter-panel"><label>Kategori<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">Tüm kategoriler</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label><label>Platform<select value={platform} onChange={event => setPlatform(event.target.value as 'all' | HubPlatform)}><option value="all">Tüm platformlar</option>{Object.entries(platformMeta).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select></label>{(category !== 'all' || platform !== 'all') && <button onClick={() => { setCategory('all'); setPlatform('all'); }}><X size={13}/> Temizle</button>}</section>}
      <div className="hub-results-head"><span><strong>{filtered.length}</strong> bağlantı</span>{(search || category !== 'all' || platform !== 'all') && <small>aktif filtrelerle eşleşiyor</small>}</div>
      {filtered.length > 0 ? <div className="hub-link-grid">{filtered.map(link => <LinkCard key={link.id} link={link} onDelete={() => onDelete(link.id)}/>)}</div> : <section className="hub-empty"><span>{links.length ? <Search size={25}/> : <ImageIcon size={25}/>}</span><h2>{links.length ? 'Eşleşen bağlantı yok.' : 'İlk bağlantını yakala.'}</h2><p>{links.length ? 'Aramayı veya filtreleri sadeleştir.' : 'YouTube, X, GitHub, Instagram veya herhangi bir web adresini ekleyebilirsin.'}</p><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={15}/> Bağlantı ekle</button></section>}
    </>}
    {tab === 'workflow' && <WorkflowView/>}
    {tab === 'knowledge' && <KnowledgeView/>}
    {showAdd && <AddLinkDialog currentUser={currentUser} onClose={() => setShowAdd(false)} onAdd={onAdd}/>} 
  </div>;
}
