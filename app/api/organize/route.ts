import { authenticatedUser, unauthorized } from '../../../auth/context';
export const dynamic = 'force-dynamic';

type OrbitTarget = {
  kind: 'todo' | 'buy' | 'visit' | 'project' | 'project_task' | 'rebuild_task' | 'department_task' | 'program_task' | 'calendar_event' | 'note';
  title: string;
  details: string;
  targetId: string;
  category: string;
  price: string;
  link: string;
  locationUrl: string;
  date: string;
  time: string;
  duration: string;
  tags: string[];
  subtasks: string[];
};

const targetKinds = ['todo', 'buy', 'visit', 'project', 'project_task', 'rebuild_task', 'department_task', 'program_task', 'calendar_event', 'note'] as const;

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function localPlan(text: string): OrbitTarget[] {
  const normalized = text.replace(/\r/g, '').trim();
  const parts = normalized.split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9])/).map((part) => part.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean);
  const candidates = parts.length > 1 ? parts : [normalized];

  return candidates.slice(0, 16).map((part) => {
    const lower = part.toLocaleLowerCase('tr');
    const price = part.match(/(?:₺|tl\s*)?(\d[\d.,]*)\s*(?:₺|tl)/i)?.[1] ?? '';
    const url = part.match(/https?:\/\/\S+/i)?.[0] ?? '';
    const date = part.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? '';
    const time = part.match(/\b(?:[01]?\d|2[0-3])[:.]([0-5]\d)\b/)?.[0]?.replace('.', ':') ?? '';
    let kind: OrbitTarget['kind'] = 'note';
    if (/(satın|alınacak|alacağım|sipariş|fiyat|\btl\b|₺)/i.test(lower)) kind = 'buy';
    else if (/(gezilecek|ziyaret|gitmek|mekan|konum|harita|maps)/i.test(lower)) kind = 'visit';
    else if (/(takvim|randevu|toplantı|etkinlik|yarın|bugün|saat\s|\d{1,2}[:.]\d{2})/i.test(lower)) kind = 'calendar_event';
    else if (/(yeni proje|proje fikri|uygulama geliştir|uygulaması|web sitesi)/i.test(lower)) kind = 'project';
    else if (/(görev|yapılacak|hatırla|kontrol et|hazırla|tamamla)/i.test(lower)) kind = 'todo';

    return {
      kind,
      title: part.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Yeni kayıt',
      details: part,
      targetId: '',
      category: '',
      price,
      link: kind === 'buy' ? url : '',
      locationUrl: kind === 'visit' ? url : '',
      date,
      time,
      duration: '60 dk',
      tags: [],
      subtasks: [],
    };
  });
}

export async function POST(request: Request) {
  if (!authenticatedUser()) return unauthorized();
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) return json({ error: 'Geçersiz istek kaynağı.' }, { status: 403 });

  const body = await request.json().catch(() => null) as { text?: string; context?: unknown } | null;
  const text = body?.text?.trim() ?? '';
  if (!text || text.length > 20_000) return json({ error: '1–20.000 karakter arasında bir metin gerekli.' }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ items: localPlan(text), mode: 'local' });

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array', minItems: 1, maxItems: 20,
        items: {
          type: 'object', additionalProperties: false,
          required: ['kind', 'title', 'details', 'targetId', 'category', 'price', 'link', 'locationUrl', 'date', 'time', 'duration', 'tags', 'subtasks'],
          properties: {
            kind: { type: 'string', enum: targetKinds },
            title: { type: 'string', maxLength: 140 },
            details: { type: 'string', maxLength: 3000 },
            targetId: { type: 'string', maxLength: 120 },
            category: { type: 'string', maxLength: 120 },
            price: { type: 'string', maxLength: 40 },
            link: { type: 'string', maxLength: 1000 },
            locationUrl: { type: 'string', maxLength: 1000 },
            date: { type: 'string', maxLength: 20 },
            time: { type: 'string', maxLength: 10 },
            duration: { type: 'string', maxLength: 30 },
            tags: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 40 } },
            subtasks: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 180 } },
          },
        },
      },
    },
  };

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5-mini',
        store: false,
        instructions: 'Türkçe kişisel üretkenlik uygulaması Orbit için kullanıcı metnini atomik, düzenli kayıtlara ayır. Anlamı koru, tekrar üretme. Mevcut hedef kimliklerinden uygun olanı context içinden seç; emin değilsen targetId boş bırak. Satın alma kayıtlarında fiyat/linki, yer kayıtlarında harita linkini, etkinliklerde tarih/saat/süreyi çıkar. Proje fikrinde project, mevcut projeye iş ekleniyorsa project_task kullan. Genel düşünceleri note, eylemleri todo yap.',
        input: `MEVCUT ORBIT BAĞLAMI:\n${JSON.stringify(body?.context ?? {})}\n\nKULLANICI METNİ:\n${text}`,
        text: { format: { type: 'json_schema', name: 'orbit_capture_plan', strict: true, schema } },
        max_output_tokens: 4000,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const outputText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
    if (!outputText) throw new Error('OpenAI boş yanıt verdi');
    const parsed = JSON.parse(outputText) as { items?: OrbitTarget[] };
    if (!Array.isArray(parsed.items) || !parsed.items.length) throw new Error('OpenAI plan üretmedi');
    return json({ items: parsed.items, mode: 'ai' });
  } catch (error) {
    console.error('Orbit AI organize failed', error);
    return json({ items: localPlan(text), mode: 'local' });
  }
}
