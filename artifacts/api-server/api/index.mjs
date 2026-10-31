// Vercel function entry. It loads the esbuild bundle that
// `pnpm run build:vercel` writes to dist/vercel.mjs, so Node never has to load
// the TypeScript sources of workspace packages such as @workspace/api-zod.
export { default } from "../dist/vercel.mjs";
