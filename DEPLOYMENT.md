# Production deployment

The only production target is **https://os.cosmibit.com**, served by Cloudflare Worker `personalos`.

## AI generation provider

Rebuild generation supports OpenAI Responses and Gemini GenerateContent. For Gemini, add `GEMINI_API_KEY` as a **Secret** on the `personalos` Worker and `AI_PROVIDER=gemini` as a text variable. The default model is `gemini-2.5-flash`; optional `GEMINI_MODEL` overrides it. Secrets must never be added to `NEXT_PUBLIC_*`, source files or browser storage. Local development uses ignored `.dev.vars`, not the production secrets.

Use a Google AI Studio project on the free tier if no charges are wanted. The application cannot inspect or enforce the Google project's billing tier; enabling billing there changes usage costs. Quota errors stop generation with an explicit message. There is no automatic switch to OpenAI or another paid model, and no hard-coded idea fallback. Gemini's free tier may use submitted content for product improvement. Rebuild sends generation requests, generated idea history for deduplication and selected vocabulary; it does not send private project notes, photos, calendar data or the workspace snapshot. Quick-capture organization remains separate and uses its existing local path unless OpenAI is configured.

OpenAI remains available via `AI_PROVIDER=openai`, `OPENAI_API_KEY` and optional `OPENAI_MODEL`. ChatGPT Plus does not provide API credits. When no provider is selected, a configured Gemini key selects Gemini; otherwise OpenAI is selected. An explicitly selected provider never borrows the other provider's credentials.

- Push changes to `main` in `hamzaoykurt/orbit`.
- Cloudflare Workers Builds automatically runs `npm run build`, then `npx wrangler deploy --config dist/server/wrangler.json`.
- Wait for that commit's Cloudflare build to finish successfully. A Git push or a successful local build alone does not mean production was updated.
- Verify the actual production response and its JavaScript assets before reporting completion. Do not publish to or open the former ChatGPT Sites URL.
- Keep the existing `DB` binding and database ID. Do not recreate or migrate user data just to deploy code.

## Photo storage

The production account currently has R2 disabled. The previous placeholder `site-creator-r2` binding caused three deployments to fail with Cloudflare error `10042` after successful builds. That mandatory binding has been removed; missing storage now returns an explicit 503 instead of blocking all releases.

Photo uploads now use the verified Worker session, but still need a real, user-approved storage setup. Do not enable billing, trust arbitrary identity headers, or make private photos public to bypass these requirements. No bucket or remote data was deleted by removing the local Sites integration.

## Private access and remembered devices

The Worker entry point (`worker/index.ts`) authenticates all pages, APIs, RSC responses and application assets. Keep `assets.run_worker_first: true`; disabling it exposes client bundles containing personal defaults. Only the login page, service worker and explicitly listed generic icons/manifest are public. API routes also require the server's authenticated request context; client identity headers are never trusted.

Before the first authenticated deployment:

1. Run `node scripts/setup-auth.mjs hamz` locally. It creates ignored `.dev.vars`, `outputs/auth-secrets.json` and `outputs/orbit-giris.txt`. Never commit or share these files. Existing credentials are not overwritten.
2. Apply the additive auth migration with `npm run db:migrate:remote` (and `npm run db:migrate:local` for development). Existing `orbit_state` data and its workspace ID stay unchanged.
3. Run `npx wrangler secret bulk outputs/auth-secrets.json --config wrangler.jsonc`. This uploads the username and salted scrypt hash, never the plaintext password. Preserve existing Google secrets.
4. Build, test and deploy normally. Missing credentials or unavailable authentication storage fail closed.

On your own device select **Beni hatırla**: the HttpOnly, Secure, SameSite=Lax cookie lasts 90 days, renewed during authenticated use at most once daily. Both Max-Age and Expires are set. Lax supports top-level installed-app launches; same-origin validation still protects every mutation. The session is stored in D1 using only a SHA-256 hash of a random 256-bit token. Without this option, the cookie lasts for the browser session, with a 24-hour server expiry. Logout revokes that device's token and clears private browser caches. Changing the username/password hash invalidates all existing sessions.

The login screen rechecks `/auth/session` using a same-origin request before clearing old private snapshots. This recovers existing Strict cookies that were omitted from an external launch. A successful session check or document navigation reissues the cookie with its remaining server lifetime, upgrading old attributes without prolonging expired sessions. Offline/503 responses never trigger snapshot deletion or grant access. Installed mode preselects **Beni hatırla**, and failed logins preserve the checkbox choice. No credentials or session tokens are kept in JavaScript storage.

The current login username is `hamz`. A rename must preserve the password hash and the existing workspace. Generation history is keyed by username, so inspect and migrate its ownership if there are existing rows; the history was empty when renaming `emir` to `hamz`. Do not alter `orbit_state` or recreate the database. A rename requires one new login on each device because it changes the credential version.

Password hashes use scrypt (`N=16384`, `r=8`, `p=5`, 16-byte random salt). Login attempts are limited in D1 per Cloudflare client IP; mutation requests require a matching Origin. There is no public registration or password reset endpoint. Rotate credentials through the same server secrets, generating a new salted hash locally; do not add a client-side password or public setup bypass.

Run `node --test tests/*.test.mjs`, `npx tsc --noEmit`, and `npm run build`. For a production-runtime local preview, use `npx wrangler dev --config dist/server/wrangler.json --persist-to .wrangler/state --port 8787` **after** local migrations. Stop that preview before rebuilding on Windows (open asset directory handles can otherwise prevent the build).

`npm run dev` migrates local auth tables, builds, and runs this same protected Worker on port 3000. This intentionally replaces the bare Vinext development server, which dispatches page requests outside the custom Worker entry and loses the verified authentication context. Restart `npm run dev` after source edits; this preview does not provide React HMR. Do not expose an unguarded Vinext server as a workaround.

Offline copies of private HTML and JS are intentionally not cached. The service worker removes legacy Orbit caches. Always verify anonymous `/api/state`, RSC and real JS asset requests return 401, remembered login survives reload, and logout denies reuse of the old cookie on the live domain.
