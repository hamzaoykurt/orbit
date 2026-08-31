'use client';

import { useRef, useState } from 'react';
import { Plus, Link2, Trash2 } from 'lucide-react';
import { connectDiagramNodes, moveDiagramNode, removeDiagramNode } from './project-types';
import type { Diagram } from './project-types';

export function DiagramEditor({ diagram, onChange }: { diagram: Diagram; onChange: (value: Diagram) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preview, setPreview] = useState<Diagram | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; width: number; height: number; x: number; y: number; startX: number; startY: number } | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const current = preview ?? diagram;
  const node = diagram.nodes.find(item => item.id === selected);
  const add = () => {
    const id = crypto.randomUUID();
    onChange({ ...diagram, nodes: [...diagram.nodes, { id, label: `Yeni adım ${diagram.nodes.length + 1}`, x: 60 + (diagram.nodes.length % 4) * 220, y: 60 + (Math.floor(diagram.nodes.length / 4) % 3) * 170, color: 'violet' }] }); setSelected(id);
  };
  return <section className="pw-diagram-editor" aria-label={`${diagram.title} diyagramı`}>
    <div className="pw-toolbar"><label className="pw-grow">Diyagram adı<input maxLength={120} value={diagram.title} onChange={event => onChange({ ...diagram, title: event.target.value })}/></label><button type="button" disabled={diagram.nodes.length >= 40} onClick={add}><Plus size={16}/> Kutu ekle</button></div>
    <p className="pw-hint">Kutuları sürükle; seçerek metnini ve rengini değiştir. Klavyede ok tuşlarıyla da taşıyabilirsin.</p>
    <div className="pw-diagram-scroll"><div ref={board} className="pw-diagram-canvas">
      <svg viewBox="0 0 1000 600" aria-hidden="true"><defs><marker id={`arrow-${diagram.id}`} markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="currentColor"/></marker></defs>{current.edges.map(edge => {
        const a = current.nodes.find(item => item.id === edge.from); const b = current.nodes.find(item => item.id === edge.to);
        if (!a || !b) return null;
        const right = b.x >= a.x;
        const x1 = a.x + (right ? 180 : 0); const x2 = b.x + (right ? 0 : 180);
        return <path key={edge.id} d={`M ${x1} ${a.y + 40} C ${x1 + (right ? 70 : -70)} ${a.y + 40}, ${x2 + (right ? -70 : 70)} ${b.y + 40}, ${x2} ${b.y + 40}`} markerEnd={`url(#arrow-${diagram.id})`} fill="none" stroke="currentColor" strokeWidth="2.5"/>;
      })}</svg>
      {current.nodes.map(item => <button type="button" key={item.id} className={`pw-diagram-node pw-node-${item.color} ${selected === item.id ? 'selected' : ''}`} style={{ left: `${item.x / 10}%`, top: `${item.y / 6}%` }} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)} onKeyDown={event => {
        const offset: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
        if (!offset[event.key]) return; event.preventDefault(); const [x, y] = offset[event.key]; onChange(moveDiagramNode(diagram, item.id, item.x + x, item.y + y));
      }} onPointerDown={event => {
        if (event.button !== 0 || !board.current) return;
        const rect = board.current.getBoundingClientRect(); event.currentTarget.setPointerCapture(event.pointerId); setSelected(item.id);
        drag.current = { id: item.id, dx: event.clientX, dy: event.clientY, width: rect.width, height: rect.height, x: item.x, y: item.y, startX: item.x, startY: item.y };
      }} onPointerMove={event => {
        if (!drag.current || drag.current.id !== item.id) return;
        const d = drag.current; d.x = d.startX + (event.clientX - d.dx) / d.width * 1000; d.y = d.startY + (event.clientY - d.dy) / d.height * 600;
        setPreview(moveDiagramNode(diagram, item.id, d.x, d.y));
      }} onPointerUp={() => { if (drag.current) onChange(moveDiagramNode(diagram, item.id, drag.current.x, drag.current.y)); drag.current = null; setPreview(null); }} onPointerCancel={() => { drag.current = null; setPreview(null); }} title={item.label}><span>{item.label || 'İsimsiz adım'}</span></button>)}
      {!current.nodes.length && <div className="pw-diagram-empty">Bir fikir, ekran ya da süreç adımı ekleyerek başla.</div>}
    </div></div>
    {node && <div className="pw-toolbar pw-node-settings"><label className="pw-grow">Seçili kutu<input maxLength={140} value={node.label} onChange={event => onChange({ ...diagram, nodes: diagram.nodes.map(item => item.id === node.id ? { ...item, label: event.target.value } : item) })}/></label><label>Renk<select value={node.color} onChange={event => onChange({ ...diagram, nodes: diagram.nodes.map(item => item.id === node.id ? { ...item, color: event.target.value } : item) })}><option value="violet">Mor</option><option value="mint">Yeşil</option><option value="sand">Kum</option><option value="blue">Mavi</option></select></label><button type="button" onClick={() => { if (window.confirm('Bu kutu ve ona bağlı çizgiler silinsin mi?')) { onChange(removeDiagramNode(diagram, node.id)); setSelected(null); } }}><Trash2 size={16}/> Kutuyu sil</button></div>}
    <form className="pw-toolbar" onSubmit={event => { event.preventDefault(); onChange(connectDiagramNodes(diagram, from, to, crypto.randomUUID())); }}><label className="pw-grow">Başlangıç<select value={from} onChange={event => setFrom(event.target.value)}><option value="">Kutu seç</option>{diagram.nodes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="pw-grow">Hedef<select value={to} onChange={event => setTo(event.target.value)}><option value="">Kutu seç</option>{diagram.nodes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button disabled={!from || !to || from === to}><Link2 size={16}/> Bağla</button></form>
    {diagram.edges.length > 0 && <details className="pw-edges"><summary>{diagram.edges.length} bağlantı</summary>{diagram.edges.map(edge => <div key={edge.id}><span>{diagram.nodes.find(item => item.id === edge.from)?.label} → {diagram.nodes.find(item => item.id === edge.to)?.label}</span><button type="button" aria-label="Bağlantıyı kaldır" onClick={() => onChange({ ...diagram, edges: diagram.edges.filter(item => item.id !== edge.id) })}><Trash2 size={14}/></button></div>)}</details>}
  </section>;
}
