import { authenticatedUser, unauthorized } from '../../../../auth/context';
import { googleCalendarFetch, googleErrorResponse } from '../../../../integrations/google-calendar/server';

export const dynamic = 'force-dynamic';

const isGone = (status: number) => status === 404 || status === 410;
const cleanId = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : null;
const noStore = { 'Cache-Control': 'no-store' };

const calendarPath = (calendarId: string, suffix = '') => `/calendars/${encodeURIComponent(calendarId)}/events${suffix}`;

export async function GET(request: Request) {
  const owner = authenticatedUser();
  if (!owner) return unauthorized();
  try {
    const url = new URL(request.url);
    const timeMin = url.searchParams.get('timeMin') ?? '';
    const timeMax = url.searchParams.get('timeMax') ?? '';
    const start = Date.parse(timeMin);
    const end = Date.parse(timeMax);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 370 * 86_400_000) {
      return Response.json({ error: 'Geçerli bir takvim tarih aralığı gerekli.' }, { status: 400 });
    }
    const query = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    const response = await googleCalendarFetch(owner, calendarId => `${calendarPath(calendarId)}?${query}`);
    if (!response.ok) throw new Error(`Google events list failed: ${response.status}`);
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) { return googleErrorResponse(error); }
}

export async function POST(request: Request) {
  const owner = authenticatedUser();
  if (!owner) return unauthorized();
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.summary !== 'string' || !body.summary.trim() || body.summary.length > 1000) {
      return Response.json({ error: 'Geçerli bir etkinlik adı gerekli.' }, { status: 400 });
    }
    // Orbit's own id travels in a private extended property so a later list call can match the event exactly.
    const { orbitEventId: rawOrbitId, extendedProperties: _ignored, ...rest } = body;
    const orbitEventId = cleanId(rawOrbitId);
    const payload = orbitEventId ? { ...rest, extendedProperties: { private: { orbitEventId } } } : rest;
    const serialized = JSON.stringify(payload);
    if (new TextEncoder().encode(serialized).byteLength > 32 * 1024) return Response.json({ error: 'Etkinlik verisi çok büyük.' }, { status: 413 });
    const response = await googleCalendarFetch(owner, calendarId => calendarPath(calendarId), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: serialized,
    });
    if (!response.ok) throw new Error(`Google event insert failed: ${response.status}`);
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) { return googleErrorResponse(error); }
}

export async function PATCH(request: Request) {
  const owner = authenticatedUser();
  if (!owner) return unauthorized();
  try {
    const body = await request.json() as Record<string, unknown>;
    const eventId = body.eventId;
    if (typeof eventId !== 'string' || !eventId || eventId.length > 1024) return Response.json({ error: 'Geçerli bir etkinlik kimliği gerekli.' }, { status: 400 });
    if (body.summary !== undefined && (typeof body.summary !== 'string' || !body.summary.trim() || body.summary.length > 1000)) {
      return Response.json({ error: 'Geçerli bir etkinlik adı gerekli.' }, { status: 400 });
    }
    if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 8000)) {
      return Response.json({ error: 'Geçerli bir açıklama gerekli.' }, { status: 400 });
    }
    // Only these fields can change; anything else the client sends is dropped.
    const patch: Record<string, unknown> = {};
    for (const key of ['summary', 'description', 'start', 'end']) if (body[key] !== undefined) patch[key] = body[key];
    const orbitEventId = cleanId(body.orbitEventId);
    if (orbitEventId) patch.extendedProperties = { private: { orbitEventId } };
    if (Object.keys(patch).length === 0) return Response.json({ error: 'Güncellenecek alan yok.' }, { status: 400 });
    for (const key of ['start', 'end'] as const) {
      const value = patch[key];
      if (value === undefined) continue;
      const point = value as { dateTime?: unknown; date?: unknown } | null;
      const ok = point && typeof point === 'object' && ((typeof point.dateTime === 'string' && Number.isFinite(Date.parse(point.dateTime))) || (typeof point.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(point.date)));
      if (!ok) return Response.json({ error: 'Geçerli bir tarih gerekli.' }, { status: 400 });
    }
    const serialized = JSON.stringify(patch);
    if (new TextEncoder().encode(serialized).byteLength > 32 * 1024) return Response.json({ error: 'Etkinlik verisi çok büyük.' }, { status: 413 });
    const response = await googleCalendarFetch(owner, calendarId => calendarPath(calendarId, `/${encodeURIComponent(eventId)}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: serialized,
    });
    if (isGone(response.status)) return Response.json({ code: 'gone' }, { headers: noStore });
    if (!response.ok) throw new Error(`Google event patch failed: ${response.status}`);
    return new Response(response.body, { status: 200, headers: { 'Content-Type': 'application/json', ...noStore } });
  } catch (error) { return googleErrorResponse(error); }
}

export async function DELETE(request: Request) {
  const owner = authenticatedUser();
  if (!owner) return unauthorized();
  try {
    const body = await request.json() as { eventId?: unknown };
    if (typeof body.eventId !== 'string' || !body.eventId || body.eventId.length > 1024) return Response.json({ error: 'Geçerli bir etkinlik kimliği gerekli.' }, { status: 400 });
    const eventId = body.eventId;
    const response = await googleCalendarFetch(owner, calendarId => calendarPath(calendarId, `/${encodeURIComponent(eventId)}`), { method: 'DELETE' });
    if (isGone(response.status)) return Response.json({ deleted: true, code: 'gone' }, { headers: noStore });
    if (!response.ok) throw new Error(`Google event delete failed: ${response.status}`);
    return Response.json({ deleted: true }, { headers: noStore });
  } catch (error) { return googleErrorResponse(error); }
}
