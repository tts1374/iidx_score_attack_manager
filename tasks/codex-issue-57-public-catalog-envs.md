# Issue #57: public catalog API environments

BASE_SHA: 87025c7928a364519e06cd77b6adc7a3401cec8b

## Purpose

Enable the public catalog API in staging and production by wiring the web app builds to environment-specific API URLs and deploying the public catalog Worker against environment-specific D1 databases.

## Non-goals

- Do not change Web Locks, single-tab behavior, Service Worker behavior, startup routing, or PWA behavior.
- Do not change SQLite WASM / OPFS persistence, import/export format, `def_hash`, public catalog payload shape, or shared API contracts.
- Do not change the public catalog DB schema beyond applying the existing migrations to the target D1 databases.
- Do not change public catalog UI text or client request behavior.

## Changes

- Add `staging` and `production` environments to `packages/public-catalog-api/wrangler.jsonc`, each with a distinct Worker name and D1 database binding.
- Keep committed D1 IDs as placeholders and inject target `database_id` from GitHub Variables inside deploy workflows.
- Deploy public catalog API and apply D1 migrations before building the web app in both STG and PROD workflows.
- Pass `VITE_PUBLIC_CATALOG_API_BASE_URL` from GitHub Variables into the STG and PROD web app builds.

## Affected scope

- User impact: public catalog browse/publish flows become available on deployed STG/PROD when the API URL variables point to the deployed Worker.
- Data impact: existing public catalog D1 migration SQL is applied to distinct STG/PROD D1 databases.
- Compatibility impact: no payload, URL path, schema, or client contract changes are intended.
- PWA/startup/save impact: none intended.
- Packages/files: `packages/public-catalog-api`, `packages/web-app`, `.github/workflows/deploy-stg.yml`, `.github/workflows/deploy-prod.yml`.

## Required deployment configuration

GitHub Variables:

- `STG_PUBLIC_CATALOG_API_BASE_URL`
- `STG_PUBLIC_CATALOG_D1_DATABASE_ID`
- `PROD_PUBLIC_CATALOG_API_BASE_URL`
- `PROD_PUBLIC_CATALOG_D1_DATABASE_ID`
- `CLOUDFLARE_ACCOUNT_ID`

GitHub Secrets:

- `CLOUDFLARE_API_TOKEN`
- `STG_DEPLOY_KEY` for the existing STG Pages repository push

Cloudflare Worker secrets must be set separately for each Worker environment:

- `RATE_LIMIT_SALT` for `iidx-public-catalog-api-stg`
- `RATE_LIMIT_SALT` for `iidx-public-catalog-api`

## Test plan

- `pnpm --filter @iidx/public-catalog-api lint`
- `pnpm --filter @iidx/public-catalog-api test`
- `pnpm --filter @iidx/public-catalog-api cf:check`
- `pnpm --filter @iidx/web-app lint`
- `pnpm --filter @iidx/web-app test -- public-catalog`
- `pnpm --filter @iidx/web-app build` with a representative `VITE_PUBLIC_CATALOG_API_BASE_URL`
- After deployment, read back the STG/PROD workflow result and verify deployed public catalog pages no longer show the unavailable API message.

## Rollback

- Revert the workflow and wrangler configuration changes.
- If needed, redeploy the previous Worker version with Wrangler rollback.
- D1 migration rollback is not expected because this change uses the existing initial schema only; if migration apply creates a fresh DB schema in a wrong database, stop using that D1 ID and bind the Worker back to the correct database.

## Commit split

1. Add public catalog Worker environment configuration.
2. Wire STG/PROD deploy workflows to migrate/deploy the Worker and inject web app API URLs.
3. Add the Issue #57 task artifact.
