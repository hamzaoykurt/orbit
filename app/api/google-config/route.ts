import { authenticatedUser, unauthorized } from '../../../auth/context';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!authenticatedUser()) return unauthorized();
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()
    || '';
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim()
    || process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_ID?.trim()
    || 'primary';

  return Response.json(
    { clientId, calendarId },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
