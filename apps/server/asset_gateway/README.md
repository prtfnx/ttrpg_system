# Asset gateway

Cloudflare Worker entry point for private R2 browser transfers. FastAPI signs
short-lived capabilities; the Worker validates them before an R2 binding is
used. Downloads are cached only after authorization. Upload capabilities are
size/type/hash bound and consumed once by the `AssetBudget` Durable Object.
Each accepted upload conservatively reserves its expected PUT, verification,
and promotion operations; abandoned uploads remain counted rather than risking
free-tier overrun.

Before deployment:

1. Set the real R2 `bucket_name` and allowed application origins in
   `wrangler.jsonc`.
2. Run `pnpm dlx wrangler@latest secret put ASSET_WORKER_HMAC_SECRET` and enter
   the same random 32+ character secret configured on FastAPI.
3. Attach a custom domain or route; Cloudflare Cache API writes do not persist
   on `*.workers.dev`.
4. Configure the route fail mode as **fail closed**.
5. Deploy with `pnpm run deploy` from this directory.

To rotate the signing secret without invalidating capabilities that are still
in flight:

1. Store the old value as `ASSET_WORKER_HMAC_PREVIOUS_SECRET` on the Worker.
2. Replace `ASSET_WORKER_HMAC_SECRET` on the Worker with the new random value.
3. Deploy the Worker, then set the FastAPI `ASSET_WORKER_HMAC_SECRET` to the new
   value and deploy FastAPI.
4. Wait one hour (the gateway's maximum accepted capability lifetime), delete
   `ASSET_WORKER_HMAC_PREVIOUS_SECRET`, and deploy the Worker again.

Run dependency-free unit tests with `pnpm test`.
