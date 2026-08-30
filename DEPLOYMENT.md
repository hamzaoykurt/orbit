# Production deployment

The only production target is **https://os.cosmibit.com**, served by Cloudflare Worker `personalos`.

- Push changes to `main` in `hamzaoykurt/orbit`.
- Cloudflare Workers Builds automatically runs `npm run build`, then `npx wrangler deploy --config dist/server/wrangler.json`.
- Wait for that commit's Cloudflare build to finish successfully. A Git push or a successful local build alone does not mean production was updated.
- Verify the actual production response and its JavaScript assets before reporting completion. Do not publish to or open the former ChatGPT Sites URL.
- Keep the existing `DB` binding and database ID. Do not recreate or migrate user data just to deploy code.

## Photo storage

The production account currently has R2 disabled. The previous placeholder `site-creator-r2` binding caused three deployments to fail with Cloudflare error `10042` after successful builds. That mandatory binding has been removed; missing storage now returns an explicit 503 instead of blocking all releases.

Photo uploads still need both a real, user-approved storage setup and verified authentication on the custom domain. Do not enable billing, trust arbitrary identity headers, or make private photos public to bypass these requirements. No bucket or remote data was deleted by removing the local Sites integration.
