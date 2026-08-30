'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Pencil, Undo2, X, Upload } from 'lucide-react';

type Stroke = { color: string; width: number; points: { x: number; y: number }[] };
export function PhotoAnnotator({ source, name, onClose, onSave }: { source: string; name: string; onClose: () => void; onSave: (blob: Blob) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const original = useRef<HTMLImageElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef<number | null>(null);
  const [color, setColor] = useState('#ed4757');
  const [width, setWidth] = useState(6);
  const [strokeCount, setStrokeCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const paint = () => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx || !original.current) return;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, element.width, element.height);
    ctx.drawImage(original.current, 0, 0, element.width, element.height);
    for (const stroke of strokes.current) {
      ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); stroke.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke();
      if (stroke.points.length === 1) { const point = stroke.points[0]; ctx.beginPath(); ctx.arc(point.x, point.y, stroke.width / 2, 0, Math.PI * 2); ctx.fill(); }
    }
  };
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled || !canvas.current) return;
      const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.current.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.current.height = Math.max(1, Math.round(image.naturalHeight * scale));
      original.current = image;
      const ctx = canvas.current.getContext('2d');
      if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.current.width, canvas.current.height); ctx.drawImage(image, 0, 0, canvas.current.width, canvas.current.height); }
      setReady(true);
    };
    image.onerror = () => { if (!cancelled) setError('Fotoğraf açılamadı. JPG, PNG veya WebP kullanıp tekrar dene.'); };
    image.src = source;
    return () => { cancelled = true; element?.close(); };
  }, [source]);
  const position = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height };
  };
  const close = () => { if (!saving && (!strokes.current.length || window.confirm('Kaydedilmemiş işaretlemelerden vazgeçilsin mi?'))) onClose(); };
  const save = async () => {
    if (!canvas.current || !ready || saving) return;
    setSaving(true); setError('');
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(value => value ? resolve(value) : reject(new Error('Fotoğraf hazırlanamadı.')), 'image/jpeg', 0.9));
      await onSave(blob);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Yüklenemedi. Tekrar dene.'); }
    finally { setSaving(false); }
  };
  return <dialog className="pw-photo-dialog" ref={dialog} aria-labelledby="photo-editor-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><span className="eyebrow">FOTOĞRAF ÜZERİNDE ÇALIŞ</span><h2 id="photo-editor-title">İstediğin yeri işaretle.</h2><p>{name} · Kalem, fare veya parmağınla çiz.</p></div><button type="button" aria-label="Fotoğraf düzenleyiciyi kapat" disabled={saving} onClick={close}><X size={20}/></button></header>
    <div className="pw-pen-tools"><Pencil size={18}/><label>Renk<input type="color" value={color} disabled={saving} onChange={event => setColor(event.target.value)}/></label><label>Kalınlık<input aria-label="Kalem kalınlığı" type="range" min="2" max="24" value={width} disabled={saving} onChange={event => setWidth(Number(event.target.value))}/></label><button type="button" disabled={!strokeCount || saving} onClick={() => { strokes.current.pop(); setStrokeCount(strokes.current.length); paint(); }}><Undo2 size={16}/> Geri al</button><button type="button" disabled={!strokeCount || saving} onClick={() => { strokes.current = []; setStrokeCount(strokes.current.length); paint(); }}>Yeni çizimleri temizle</button></div>
    <div className="pw-canvas-wrap"><canvas ref={canvas} aria-label="Fotoğraf işaretleme tuvali" onPointerDown={event => {
      if (!ready || saving || drawing.current !== null || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId); drawing.current = event.pointerId;
      strokes.current.push({ color, width: width * event.currentTarget.width / event.currentTarget.getBoundingClientRect().width, points: [position(event)] });
      setStrokeCount(strokes.current.length); paint();
    }} onPointerMove={event => { if (drawing.current !== event.pointerId) return; strokes.current[strokes.current.length - 1].points.push(position(event)); paint(); }} onPointerUp={() => { drawing.current = null; }} onPointerCancel={() => { drawing.current = null; }} /></div>
    {error && <p className="pw-error" role="alert">{error}</p>}
    <footer><small>Fotoğrafın işaretlenmiş kopyası göreve eklenir. Mevcut fotoğraftaki eski çizimler silinmez.</small><button type="button" className="primary-button" disabled={!ready || saving} onClick={() => void save()}><Upload size={16}/>{saving ? 'Yükleniyor…' : 'Fotoğrafı göreve kaydet'}</button></footer>
  </dialog>;
}
