import { authenticatedUser, unauthorized } from '../../../../auth/context';
import { googleCalendarConfig, readGoogleCredential } from '../../../../integrations/google-calendar/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const owner = authenticatedUser();
  if (!owner) return unauthorized();
  try {
    const config = googleCalendarConfig();
    const credential = config.configured ? await readGoogleCredential(owner) : null;
    return Response.json({
      configured: config.configured,
      connected: Boolean(credential),
      calendarId: credential?.calendar_id || config.calendarId,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Google Calendar status failed', error);
    return Response.json({ error: 'Google Takvim durumu alınamadı.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
