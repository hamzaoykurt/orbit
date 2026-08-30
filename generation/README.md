# Rebuild generation and persistence

`/api/ideas` uses the same private Worker session and D1 database as Orbit. There is no additional backend. POST requires a same-origin request. Inputs and upstream outputs are bounded, and rate limits plus expiring per-owner leases prevent overlapping paid generations.

The provider adapter uses the existing OpenAI Responses architecture: server secrets `OPENAI_API_KEY`, optional `OPENAI_MODEL` (existing default `gpt-5-mini`) and optional `OPENAI_BASE_URL` for a compatible HTTPS endpoint. It never reads a key from the client. The production environment had no AI key when this change was developed. **Real provider quality and physical APK launch have not been verified.**

Configure `OPENAI_API_KEY` securely in the Worker `personalos` settings (or through Wrangler secret entry). Do not paste it in source files, browser settings or chat. Model configuration belongs on the server. Local testing can use the ignored `.dev.vars`. OpenAI responses use `store:false`.

Each request creates a fresh candidate. Recent history helps the generation model avoid repetition, and every stored text is checked lexically. A separate model check examines recent, textually similar and same-domain history for semantic repetition. Up to three candidates may be attempted. This is best-effort semantic checking, not a mathematical guarantee against all paraphrases. The comparison context is bounded; history is not used to recommend only familiar interests. Surprise always requests an unfamiliar direction; other requests also sometimes do so. No workout programs or random English plans are accepted from Surprise.

There is **no static idea pool and no local fallback**. Missing configuration, provider failures, refusals, malformed or repeated results produce explicit unavailable/retry states. Historical entries are clearly labeled, never presented as fresh suggestions.

New additive D1 tables keep all generated concepts, timestamps, model, type, domain, status and accepted result IDs outside the 512 KB app state limit. The service ensures these tables exist without changing `orbit_state`. Accepting a research topic is the first time its 4–6 subquestions are requested. Accepting a project is the first time its description, goal, scope, tasks and approach are requested. The accepted plan is persisted and returned unchanged on retries. The client imports projects into the existing project model with a stable ID and does not overwrite existing edits. History allows retrying an import if normal app-state synchronization failed.

`rebuildPractice` in the existing Orbit state persists vocabulary/review times, speaking sessions, current and prior research with optional notes, the selected meal, and the linked project ID. `rebuildDeck` continues to own weekly marks and targets. Week rollover never clears long-term practice. New vocabulary and speaking prompts also use the same provider; speech pronunciation uses browser text-to-speech where supported. Speaking is self-practice with a real start/finish duration, not a simulated AI call or assessment.

Tests use explicit synthetic fixtures and an in-memory SQLite database, never a production fallback. Run `node --test tests/*.test.mjs`, `npx tsc --noEmit`, and `npm run build`.
