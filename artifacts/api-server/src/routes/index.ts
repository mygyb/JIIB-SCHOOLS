import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import jiibRouter from "./jiib.js";
import hqRouter from "./hq.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hqRouter);
router.use(jiibRouter);

export default router;
