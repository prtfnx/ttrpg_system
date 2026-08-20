# Asset gateway

Cloudflare Worker entry point for private R2 browser transfers. FastAPI signs
short-lived capabilities; the Worker validates them before an R2 binding is
used. Downloads are cached only after authorization. Upload capabilities are
size/type/hash bound and consumed once by the `AssetBudget` Durable Object.

Before deployment:

1. Set the real R2 `bucket_name` and allowed application origins in
   `wrangler.jsonc`.
2. Run `pnpm dlx wrangler@latest secret put ASSET_WORKER_HMAC_SECRET` and enter
   the same random 32+ character secret configured on FastAPI.
3. Attach a custom domain or route; Cloudflare Cache API writes do not persist
   on `*.workers.dev`.
4. Configure the route fail mode as **fail closed**.
5. Deploy with `pnpm run deploy` from this directory.

Run dependency-free unit tests with `pnpm test`.
