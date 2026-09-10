'use client';
/* Private images are served by the authenticated media endpoint. */
/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from 'react';
import { useNavigationState } from '../use-navigation';
import { Archive, BookOpen, ExternalLink, ImagePlus, Lightbulb, Link2, LoaderCircle, NotebookPen, Plus, Search, StickyNote, Trash2, X } from 'lucide-react';
import type { Note,NoteKind } from './note-model';
import { newNote } from './note-model';

const templates:Record<NoteKind,{label:string;description:string;icon:typeof StickyNote;context:string;body:string;outcome:string;next:string}>={
  quick:{label:'Hızlı not',description:'Aklındakini bağlamıyla yakala.',icon:StickyNote,context:'Bunu neyin içindeyken fark ettin?',body:'Yakalamak istediğin düşünce',outcome:'Neden saklamaya değer?',next:'Bununla ilgili bir sonraki küçük adım'},
  idea:{label:'Fikir',description:'Ham düşünceyi geliştirilebilir hale getir.',icon:Lightbulb,context:'Hangi problem veya fırsat var?',body:'Fikrin nasıl çalışır?',outcome:'Kime, nasıl değer sağlar?',next:'En küçük nasıl deneyebilirsin?'},
  journal:{label:'Günlük kayıt',description:'Olayı, gözlemi ve dersini ayır.',icon:NotebookPen,context:'Ne oldu?',body:'Ne düşündün veya hissettin?',outcome:'Buradan ne öğrendin?',next:'Bir dahaki sefere neyi farklı yaparsın?'},
  reference:{label:'Referans',description:'Bulduğun şeyi neden sakladığını unutma.',icon:Link2,context:'Nerede buldun, hangi konuyla ilgili?',body:'İçeriğin kendi cümlelerinle özeti',outcome:'Nerede işine yarayabilir?',next:'Daha sonra neye bakmalısın?'},
  qiblatayn:{label:'Kıbleteyn Notları',description:'Kıbleteyn notlarını bir arada tut.',icon:BookOpen,context:'',body:'Not',outcome:'',next:''}
};
const safeUrl=(value:string)=>{try{const url=new URL(value.trim());return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};

function Editor({note,onChange,onArchive,onDelete,onClose}:{note:Note;onChange:(change:Partial<Note>)=>void;onArchive:()=>void;onDelete:()=>void;onClose:()=>void}){
  const template=templates[note.kind];
  const [link,setLink]=useState({title:'',url:''});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [confirmDelete,setConfirmDelete]=useState(false);
  const upload=async(file:File)=>{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){setError('En fazla 10 MB boyutunda JPG, PNG veya WebP seç.');return;}
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/project-media',{method:'POST',headers:{'Content-Type':file.type},body:file,signal:AbortSignal.timeout(60000)});
      const data=await response.json() as {id?:string;url?:string;createdAt?:string;error?:string};
      if(!response.ok||!data.id||!data.url)throw new Error(data.error||'Görsel yüklenemedi.');
      onChange({images:[...note.images,{id:data.id,url:data.url,name:file.name,caption:'',createdAt:data.createdAt||new Date().toISOString()}]});
    }catch(cause){setError(cause instanceof Error?cause.message:'Görsel yüklenemedi.');}
    finally{setBusy(false);}
  };
  return <>
    <section className="nh-editor surface">
      <header><div><span>{template.label.toLocaleUpperCase('tr-TR')}</span><h2>Notu düzenle.</h2><p>{template.description} Değişikliklerin otomatik kaydedilir.</p></div><button aria-label="Not düzenleyicisini kapat" onClick={onClose}><X size={18}/></button></header>
      {error&&<p className="nh-error" role="alert">{error}</p>}
      <label>Başlık<input value={note.title} maxLength={160} onChange={event=>onChange({title:event.target.value})}/></label>
      {note.kind==='qiblatayn'
        ?<div className="nh-guided nh-guided-single"><label>{template.body}<textarea rows={12} value={note.body} onChange={event=>onChange({body:event.target.value.slice(0,12000)})}/></label></div>
        :<div className="nh-guided">
          <label>{template.context}<textarea rows={3} value={note.context} onChange={event=>onChange({context:event.target.value.slice(0,4000)})}/></label>
          <label>{template.body}<textarea rows={4} value={note.body} onChange={event=>onChange({body:event.target.value.slice(0,8000)})}/></label>
          <label>{template.outcome}<textarea rows={3} value={note.outcome} onChange={event=>onChange({outcome:event.target.value.slice(0,4000)})}/></label>
          <label>{template.next}<textarea rows={3} value={note.nextStep} onChange={event=>onChange({nextStep:event.target.value.slice(0,3000)})}/></label>
        </div>}
      <section className="nh-attachments">
        <div className="nh-attach-head"><div><strong>Bağlantılar ve görseller</strong><small>Bu nota ait bağlamı yanında tut.</small></div><label className="nh-upload">{busy?<LoaderCircle size={15}/>:<ImagePlus size={15}/>} {busy?'Yükleniyor…':'Görsel ekle'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/></label></div>
        <form onSubmit={event=>{event.preventDefault();const url=safeUrl(link.url);if(!url){setError('http:// veya https:// ile başlayan geçerli bir bağlantı gir.');return;}onChange({links:[...note.links,{id:crypto.randomUUID(),title:link.title.trim()||new URL(url).hostname,url}]});setLink({title:'',url:''});}}>
          <input aria-label="Bağlantı başlığı" value={link.title} onChange={event=>setLink({...link,title:event.target.value})} placeholder="Bağlantı başlığı"/>
          <input aria-label="Bağlantı adresi" type="url" value={link.url} onChange={event=>setLink({...link,url:event.target.value})} placeholder="https://…"/>
          <button disabled={!link.url.trim()}><Plus size={14}/> Ekle</button>
        </form>
        <div className="nh-links">{note.links.map(item=><span key={item.id}><a href={safeUrl(item.url)||undefined} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/>{item.title}</a><button aria-label={`${item.title} bağlantısını kaldır`} onClick={()=>onChange({links:note.links.filter(link=>link.id!==item.id)})}><Trash2 size={12}/></button></span>)}</div>
        <div className="nh-images">{note.images.map(item=><figure key={item.id}><img src={item.url} alt={item.caption||item.name}/><input aria-label={`${item.name} açıklaması`} value={item.caption} onChange={event=>onChange({images:note.images.map(image=>image.id===item.id?{...image,caption:event.target.value.slice(0,500)}:image)})} placeholder="Bu görsel neden burada?"/><button aria-label={`${item.name} görselini kaldır`} onClick={()=>onChange({images:note.images.filter(image=>image.id!==item.id)})}><Trash2 size={13}/></button></figure>)}</div>
      </section>
      <footer><span>{note.date}</span><div className="nh-editor-actions"><button className="nh-delete" onClick={()=>setConfirmDelete(true)}><Trash2 size={14}/> Notu sil</button><button onClick={onArchive}><Archive size={14}/> Arşivle</button></div></footer>
    </section>
    {confirmDelete&&<div className="modal-layer" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setConfirmDelete(false);}}>
      <section className="modal-card taskAction noteDelete" role="dialog" aria-modal="true" aria-labelledby="note-delete-title" onKeyDown={event=>{if(event.key==='Escape')setConfirmDelete(false);}}>
        <button type="button" className="modal-close" aria-label="Silme penceresini kapat" onClick={()=>setConfirmDelete(false)}><X size={17}/></button>
        <div className="task-action-icon delete"><Trash2 size={22}/></div>
        <span className="eyebrow">NOTU SİL</span>
        <h2 id="note-delete-title">Bu not silinsin mi?</h2>
        <p>Bu işlem geri alınamaz. Not ve içindeki tüm bilgiler kalıcı olarak kaldırılacak.</p>
        <div className="task-delete-preview"><span><StickyNote size={16}/></span><div><small>SİLİNECEK NOT</small><strong>{note.title||'Başlıksız not'}</strong></div></div>
        <div className="task-action-buttons"><button type="button" autoFocus onClick={()=>setConfirmDelete(false)}>Vazgeç</button><button type="button" className="danger" onClick={onDelete}><Trash2 size={16}/> Notu sil</button></div>
      </section>
    </div>}
  </>;
}

export function NotesWorkspace({notes,onChange,onArchive}:{notes:Note[];onChange:(notes:Note[])=>void;onArchive:(note:Note)=>void}){
  const [search,setSearch]=useState(''),[filter,setFilter]=useState<'all'|NoteKind>('all');
  const [selected,setSelected]=useNavigationState<string|null>('notes:selected',null,true);
  const filtered=useMemo(()=>notes.filter(note=>(filter==='all'||note.kind===filter)&&`${note.title} ${note.body} ${note.context} ${note.outcome}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))),[notes,search,filter]);
  const active=notes.find(note=>note.id===selected)||null;
  const add=(kind:NoteKind)=>{const note=newNote(kind);onChange([note,...notes]);setSelected(note.id);};
  return <div className="nh-shell">
    <section className="nh-start surface"><div><span>YENİ NOT</span><h2>Boş sayfa değil, doğru başlangıç.</h2><p>Ne kaydettiğini seç; düzeni Orbit hazırlasın.</p></div><div className="nh-templates">{(Object.entries(templates) as [NoteKind,typeof templates[NoteKind]][]).map(([id,item])=>{const Icon=item.icon;return <button key={id} onClick={()=>add(id)}><Icon size={17}/><span><strong>{item.label}</strong><small>{item.description}</small></span><Plus size={14}/></button>;})}</div></section>
    {active&&<Editor key={active.id} note={active} onClose={()=>setSelected(null)} onDelete={()=>{onChange(notes.filter(note=>note.id!==active.id));setSelected(null);}} onArchive={()=>{onArchive(active);setSelected(null);}} onChange={change=>onChange(notes.map(note=>note.id===active.id?{...note,...change}:note))}/>}
    <div className="notes-toolbar"><div className="search-field"><Search size={15}/><input aria-label="Notlarda ara" placeholder="Başlık, içerik veya bağlam ara…" value={search} onChange={event=>setSearch(event.target.value)}/>{search&&<button aria-label="Not aramasını temizle" onClick={()=>setSearch('')}><X size={13}/></button>}</div><div className="note-filters">{([['all','Tümü'],['quick','Hızlı'],['idea','Fikir'],['journal','Günlük'],['reference','Referans'],['qiblatayn','Kıbleteyn']] as const).map(([id,label])=><button key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}</div></div>
    <div className="notes-grid">{filtered.map(note=>{const TemplateIcon=templates[note.kind].icon;return <article key={note.id} role="button" tabIndex={0} aria-label={`${note.title} notunu aç`} className={`note-card surface ${note.tone}`} onClick={()=>setSelected(note.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(note.id);}}}><div className="note-card-top"><span><TemplateIcon size={12}/> {templates[note.kind].label.toLocaleUpperCase('tr-TR')}</span><button aria-label={`${note.title} notunu arşivle`} onClick={event=>{event.stopPropagation();onArchive(note);}}><Archive size={15}/></button></div><h2>{note.title}</h2><p>{note.body||note.context||'Bu not henüz tamamlanmadı.'}</p><div className="nh-card-meta">{note.links.length>0&&<span><Link2 size={11}/>{note.links.length}</span>}{note.images.length>0&&<span><ImagePlus size={11}/>{note.images.length}</span>}</div><footer><span>{note.date}</span><span>Düzenle</span></footer></article>;})}</div>
    {!filtered.length&&<div className="notes-empty"><Search size={21}/><strong>Eşleşen not yok.</strong><span>Aramayı veya filtreyi değiştirebilirsin.</span></div>}
  </div>;
}
