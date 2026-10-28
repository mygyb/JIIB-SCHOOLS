---
name: API codegen barrel exports
description: Orval can add a duplicate broad export to the API Zod package barrel.
---

After running API codegen, `lib/api-zod/src/index.ts` may gain a trailing `export * from './generated/types'`. Because the barrel already exports generated types individually, this can cause TypeScript duplicate-export errors. Remove the broad export and keep the explicit exports.

**Why:** the generated Zod schema module and generated TypeScript types can expose the same names through that wildcard export.

**How to apply:** after codegen, inspect the barrel and run the workspace typecheck before restarting the API.
