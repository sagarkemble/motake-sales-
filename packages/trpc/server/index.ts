import { router } from "./trpc";

import { adminRouter } from "./routes/admin/route";
import { authRouter } from "./routes/auth/route";
import { billsRouter } from "./routes/bills/route";
import { customersRouter } from "./routes/customers/route";
import { documentsRouter } from "./routes/documents/route";
import { gatepassRouter } from "./routes/gatepass/route";
import { healthRouter } from "./routes/health/route";
import { ledgerRouter } from "./routes/ledger/route";
import { ordersRouter } from "./routes/orders/route";
import { paymentsRouter } from "./routes/payments/route";
import { productsRouter } from "./routes/products/route";
import { reportsRouter } from "./routes/reports/route";
import { routesRouter } from "./routes/routes/route";
import { salesmanRouter } from "./routes/salesman/route";
import { settingsRouter } from "./routes/settings/route";

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
  bills: billsRouter,
  admin: adminRouter,
  customers: customersRouter,
  documents: documentsRouter,
  gatepasses: gatepassRouter,
  ledger: ledgerRouter,
  orders: ordersRouter,
  payments: paymentsRouter,
  products: productsRouter,
  reports: reportsRouter,
  routes: routesRouter,
  salesmen: salesmanRouter,
  settings: settingsRouter,
});

export { createContext } from "./context";
export type ServerRouter = typeof serverRouter;
