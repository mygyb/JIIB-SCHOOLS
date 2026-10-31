import express, { type Express } from "express";
import cors from "cors";
import path from "node:path";
import { pinoHttp } from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();
const webDist = path.resolve(process.cwd(), "../jiib-core-sync/dist/public");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use(express.static(webDist));

app.use((req, res, next) => {
  const isApiPath = req.path === "/api" || req.path.startsWith("/api/");

  if (req.method !== "GET" || isApiPath) {
    next();
    return;
  }

  res.sendFile(path.join(webDist, "index.html"), (error) => {
    if (error) next(error);
  });
});

export default app;
