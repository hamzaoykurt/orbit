'use client';
import { useId } from 'react';
import type { DesignStyle } from './design-catalog';

/** Original, scalable specimens. No remote images, user data, or image downloads. */
export function DesignPreview({ style, layout = 'interface' }: { style: DesignStyle; layout?: 'interface' | 'composition' }) {
  const uid = useId().replace(/:/g, '');
  const t = style.tokens, id = style.id;
  const glass = ['glass','liquid','spatial'].includes(id);
  const tactile = ['clay','neumorphic','skeuomorphic'].includes(id);
  const editorial = ['editorial','luxury'].includes(id);
  const bold = ['brutal','maximal','contrast','bauhaus'].includes(id);
  const font = t.serif ? 'Georgia,serif' : 'Arial,sans-serif';
  return <svg className="pp-specimen" viewBox="0 0 360 238" role="img" aria-label={`${style.name} · ${layout === 'interface' ? 'arayüz' : 'kompozisyon'} örneği`}>
    <defs>
      <linearGradient id={`${uid}g`} x2="1" y2="1"><stop stopColor={t.accent}/><stop offset="1" stopColor={t.secondary}/></linearGradient>
      <filter id={`${uid}s`} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx={id==='brutal'?5:4} dy={id==='brutal'?5:7} stdDeviation={id==='brutal'?0:7} floodColor={t.ink} floodOpacity=".2"/>{tactile&&<feDropShadow dx="-4" dy="-4" stdDeviation="4" floodColor="#fff" floodOpacity=".5"/>}</filter>
    </defs>
    <rect width="360" height="238" fill={t.background}/>
    {glass && <><circle cx="265" cy="68" r="95" fill={`url(#${uid}g)`}/><circle cx="45" cy="218" r="95" fill={t.secondary} opacity=".6"/></>}
    {id==='retro' && <g stroke={t.accent} strokeWidth=".6" opacity=".5">{[0,1,2,3,4,5].map(i=><path key={i} d={`M ${i*72} 238 L 180 120 M 0 ${140+i*19} H 360`}/>)}</g>}
    {['futuristic','tech-minimal'].includes(id)&&<g stroke={t.secondary} opacity=".3">{[30,90,150,210,270,330].map(x=><path key={x} d={`M${x} 0v238M0 ${x}h360`}/>)}</g>}
    {layout==='composition' ? <>
      <text x="24" y="35" fill={t.ink} fontFamily={font} fontSize="9" letterSpacing="3">FORM / FEEL</text>
      <text x="24" y="102" fill={t.ink} fontFamily={font} fontWeight={bold?900:400} fontSize={editorial?54:42}>{editorial?'Less, but':'Make it'}</text>
      <text x="24" y="148" fill={t.ink} fontFamily={font} fontWeight={bold?900:400} fontSize={editorial?54:42}>{editorial?'considered.':'your own.'}</text>
      <g transform={`translate(${id==='spatial'?255:278},${editorial?188:70}) rotate(${bold?-15:0})`} filter={`url(#${uid}s)`}>
        {['bauhaus','playful','maximal'].includes(id)?<><circle r="43" fill={t.accent}/><rect x="-25" y="5" width="66" height="66" fill={t.secondary}/><path d="M-45 50L-20 0L8 50Z" fill={t.ink}/></>:<rect x="-34" y="-25" width="78" height="98" rx={glass?30:t.radius} fill={glass?`url(#${uid}g)`:t.accent} stroke={t.ink} strokeWidth={bold?3:0}/>}
      </g>
      <path d="M24 188H210" stroke={t.ink} opacity=".25"/>
      {[t.ink,t.accent,t.secondary].map((color,i)=><circle key={i} cx={32+i*24} cy="211" r="7" fill={color}/>)}
      <text x="330" y="216" textAnchor="end" fill={t.ink} fontSize="10" fontFamily={font}>01 — STUDIO</text>
    </> : <>
      <rect x="18" y="17" width="324" height="204" rx={t.radius} fill={t.surface} fillOpacity={glass?.65:1} stroke={t.ink} strokeOpacity={bold?1:.12} strokeWidth={t.border||1} filter={tactile||bold?`url(#${uid}s)`:undefined}/>
      <text x="34" y="41" fill={t.ink} fontFamily={font} fontWeight="700" fontSize="10" letterSpacing="1">{editorial?'THE EDIT':'STUDIO / 01'}</text>
      <circle cx="318" cy="37" r="7" fill={t.accent}/>
      <path d="M32 53H328" stroke={t.ink} opacity=".12"/>
      <text x="34" y="84" fill={t.ink} fontFamily={font} fontWeight={bold?900:500} fontSize={editorial?25:21}>{editorial?'A little perspective.':'Space to create.'}</text>
      <rect x="34" y="94" width="157" height="4" rx="2" fill={t.ink} opacity=".25"/>
      {id==='bento'||id==='dashboard'?<>
        {[0,1,2].map(i=><g key={i}><rect x={34+i*100} y="113" width="91" height={i?37:80} rx={t.radius} fill={i===0?t.accent:t.secondary}/><rect x={44+i*100} y="125" width="32" height="4" fill={i===0?t.background:t.ink} opacity=".6"/></g>)}
        <rect x="134" y="159" width="191" height="34" rx={t.radius} fill={t.secondary}/><path d="M145 184l26-13 28 8 26-10 31 6 45-10" fill="none" stroke={t.accent} strokeWidth="2"/>
      </>:<>
        <rect x="34" y="115" width="180" height="78" rx={t.radius} fill={glass?t.background:t.secondary} fillOpacity={glass?.4:1} filter={tactile?`url(#${uid}s)`:undefined}/>
        {id==='skeuomorphic'?<g stroke={t.ink} opacity=".2">{[134,149,164,179].map(y=><path key={y} d={`M44 ${y}H202`}/>)}</g>:<path d="M48 173C74 177 82 131 106 148S146 164 164 138S185 153 201 129" stroke={t.accent} strokeWidth="3" fill="none"/>}
        <rect x="226" y="115" width="98" height="43" rx={t.radius} fill={t.accent} filter={tactile?`url(#${uid}s)`:undefined}/>
        <text x="241" y="142" fill={t.background} fontFamily={font} fontSize="11" fontWeight="700">Explore ↗</text>
        <rect x="226" y="171" width="76" height="4" rx="2" fill={t.ink} opacity=".25"/><rect x="226" y="184" width="58" height="4" rx="2" fill={t.ink} opacity=".15"/>
      </>}
    </>}
  </svg>;
}
