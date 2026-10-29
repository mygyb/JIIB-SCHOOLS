# JIIB Core Sync

A school operations workspace for administrators, teachers, parents, and super administrators.

## Run & Operate

- The Replit preview uses the managed `artifacts/jiib-core-sync: web` and `artifacts/api-server: API Server` workflows.
- `pnpm install --frozen-lockfile` — install workspace dependencies.
- `pnpm run typecheck` — typecheck all workspace packages.
- `pnpm --filter @workspace/api-server run build` — build the API.
- `PORT=23185 BASE_PATH=/ pnpm --filter @workspace/jiib-core-sync run build` — build the web app outside its managed workflow.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec.
- API health check: `/api/healthz`.
- Required environment: `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Staff account creation/editing and profile-name updates also require the server-only `SUPABASE_SERVICE_ROLE_KEY` in Replit Secrets. Never expose that key to the browser. Development values are configured from the supplied reference HTML; configure the required values separately for production before publishing.

## Stack

- pnpm workspace, Node.js, TypeScript, React, and Vite
- API: Express 5, bundled with esbuild
- Data and authentication: Supabase Auth and PostgREST
- Validation and generated clients: Zod and Orval

## Where things live

- `artifacts/jiib-core-sync/src/App.tsx` — sign-in, routes, and primary school workspace screens.
- `artifacts/jiib-core-sync/src/features/operations.tsx` — school operations pages.
- `artifacts/jiib-core-sync/src/lib/` — Supabase client, API helpers, school config, and offline mark queue.
- `artifacts/api-server/src/routes/` — API endpoints.
- `lib/api-spec/` — OpenAPI source and code generation.
- `supabase/migrations/` — Supabase schema migrations; review before applying them to an external project.

## Architecture decisions

- The web app and API are separate managed artifacts; the API is proxied under `/api`.
- The browser queues mark updates while offline and retries them when connectivity returns.
- Supabase credentials are supplied through environment configuration; never put a service-role key in browser code.
- The supplied standalone HTML is the behavioral reference; preserve the existing React/Vite and API structure when implementing parity fixes.

## Product

Role-based school management for student records, marks, parent communication, academic terms, reporting, and school administration.

## Gotchas

- The Vite config requires `PORT` and `BASE_PATH`; the managed web workflow provides them automatically.
- Keep development and production Supabase environment values configured separately.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
