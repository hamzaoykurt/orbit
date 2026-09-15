import { authenticatedUser, unauthorized } from '../../../../auth/context';
import { getDatabase } from '../../../../db/client';
import { getGoogleAccessToken, googleCalendarConfig, googleErrorResponse, readGoogleCredential } from '../../../../integrations/google-calendar/server';

export const dynamic = 'force-dynamic';

export async function DELETE() {
  const owner = authenticatedUser();
  if (!owner) return unauthorized();
  try {
    const credential = await readGoogleCredential(owner);
    if (credential && googleCalendarConfig().configured) {
      try {
        const { accessToken } = await getGoogleAccessToken(owner);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch { /* Local disconnect must still succeed if Google is unavailable. */ }
    }
    await getDatabase().prepare('DELETE FROM orbit_google_calendar_credentials WHERE owner = ?').bind(owner).run();
    return Response.json({ disconnected: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return googleErrorResponse(error); }
}
