import app from "./app.js";

// Vercel serverless entry. Vercel calls the exported Express app as a request
// handler, so this file must not call app.listen() (src/index.ts does that for
// Replit and local runs).
export default app;
