import { authenticatedUser, unauthorized } from '../../../../auth/context';
import { googleCalendarFetch, googleErrorResponse } from '../../../../integrations/google-calendar/server';

export const dynamic = 'force-dynamic';

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
    const serialized = JSON.stringify(body);
    if (new TextEncoder().encode(serialized).byteLength > 32 * 1024) return Response.json({ error: 'Etkinlik verisi çok büyük.' }, { status: 413 });
    const response = await googleCalendarFetch(owner, calendarId => calendarPath(calendarId), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: serialized,
    });
    if (!response.ok) throw new Error(`Google event insert failed: ${response.status}`);
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
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
    if (!response.ok && response.status !== 404) throw new Error(`Google event delete failed: ${response.status}`);
    return Response.json({ deleted: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return googleErrorResponse(error); }
}
