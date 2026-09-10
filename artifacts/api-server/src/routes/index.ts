import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jiibRouter from "./jiib";

const router: IRouter = Router();

router.use(healthRouter);
router.use(jiibRouter);

export default router;
