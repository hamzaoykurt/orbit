'use client';
import { useState } from 'react';
import { Check, Maximize2, ArrowLeft } from 'lucide-react';
import { designCatalog, findDesignStyle } from './design-catalog';
import { DesignPreview } from './design-preview';
import type { DesignRecommendation } from './planning-types';

export function DesignPicker({ selected, recommendations, onSelect }: {selected:string|null;recommendations:DesignRecommendation[];onSelect:(id:string)=>void}) {
  const [all,setAll]=useState(false), [expanded,setExpanded]=useState<string|null>(null);
  const ordered=[...recommendations.map(r=>findDesignStyle(r.styleId)).filter(s=>!!s),...designCatalog.filter(s=>!recommendations.some(r=>r.styleId===s.id))];
  const specimen=findDesignStyle(expanded);
  if(specimen) return <section className="pp-style-detail">
    <button type="button" className="pp-button" onClick={()=>setExpanded(null)}><ArrowLeft size={16}/> Stillere dön</button>
    <h3>{specimen.name}</h3><p>{specimen.description}</p>
    <div className="pp-large-specimens">{specimen.previewImages.map(p=><DesignPreview key={p.layout} style={specimen} layout={p.layout}/>)}</div>
    <p>{specimen.tags.join(' · ')} / {specimen.colorCharacter} / {specimen.density}</p>
    <ul>{specimen.principles.map(p=><li key={p}>{p}</li>)}</ul>
    <p>Uygun bağlamlar: {specimen.useCases.join(', ')}</p>
    <button type="button" className="pp-button pp-primary" onClick={()=>{onSelect(specimen.id);setExpanded(null);}}>{selected===specimen.id?<><Check size={17}/> Seçili stili koru</>:'Bu tasarım dilini seç'}</button>
  </section>;
  return <div className="pp-design-picker">
    <div className="pp-style-grid">{(all?ordered:ordered.slice(0,3)).map(style=>{
      const rank=recommendations.findIndex(r=>r.styleId===style.id), chosen=selected===style.id;
      return <article key={style.id} className={`pp-style-card ${chosen?'is-selected':''} ${rank===0?'is-recommended':''}`}>
        <div className="pp-style-label">{rank===0?'ANA ÖNERİ':rank>0?`ALTERNATİF ${rank}`:'KOLEKSİYON'}{chosen&&<span><Check size={13}/> Seçili</span>}</div>
        <button type="button" className="pp-preview-button" aria-label={`${style.name} örneklerini büyüt`} onClick={()=>setExpanded(style.id)}>
          <div className="pp-mini-specimens">{style.previewImages.map(p=><DesignPreview key={p.layout} style={style} layout={p.layout}/>)}</div><span><Maximize2 size={13}/> İncele</span>
        </button>
        <div className="pp-style-copy"><h3>{style.name}</h3><p>{style.description}</p><small>{style.tags.join(' · ')} · {style.useCases.join(', ')}</small>
          {rank>=0&&<details><summary>Neden uygun olabilir?</summary><p>{recommendations[rank].reason}</p></details>}
          <button type="button" className={`pp-button ${chosen?'pp-primary':''}`} aria-pressed={chosen} onClick={()=>onSelect(style.id)}>{chosen?<><Check size={16}/> Seçildi</>:'Bu stili seç'}</button>
        </div>
      </article>;
    })}</div>
    <button type="button" className="pp-button pp-catalog-toggle" aria-expanded={all} onClick={()=>setAll(!all)}>{all?'Yalnızca önerilenleri göster':`20 tasarım dilinin tümünü keşfet`}</button>
    <p className="pp-fineprint">Örnekler stilin karakterini gösteren özgün arayüz eskizleridir; hazır proje veya tamamlanmış tasarım değildir.</p>
  </div>;
}
