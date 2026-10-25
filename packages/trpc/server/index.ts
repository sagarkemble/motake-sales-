import { router } from "./trpc";

import { adminRouter } from "./routes/admin/route";
import { authRouter } from "./routes/auth/route";
import { billsRouter } from "./routes/bills/route";
import { customersRouter } from "./routes/customers/route";
import { gatepassRouter } from "./routes/gatepass/route";
import { healthRouter } from "./routes/health/route";
import { ordersRouter } from "./routes/orders/route";
import { productsRouter } from "./routes/products/route";
import { reportsRouter } from "./routes/reports/route";
import { routesRouter } from "./routes/routes/route";
import { salesmanRouter } from "./routes/salesman/route";

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
  bills: billsRouter,
  admin: adminRouter,
  customers: customersRouter,
  gatepasses: gatepassRouter,
  orders: ordersRouter,
  products: productsRouter,
  reports: reportsRouter,
  routes: routesRouter,
  salesmen: salesmanRouter,
});

export { createContext } from "./context";
export type ServerRouter = typeof serverRouter;
