import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";

import { type ServerRouter } from "../server";

export type RouterOutputs = inferRouterOutputs<ServerRouter>;
export type RouterInputs = inferRouterInputs<ServerRouter>;

export type { ServerRouter } from "../server";

// Plain constants the web pickers share with the server (no server code).
export { INDIAN_STATES, type IndianStateName } from "@repo/services/indian-states";
export { businessDateOf } from "@repo/services/business-date";
export { AMOUNT_TOO_LARGE, MAX_AMOUNT_PAISE, MAX_QTY, QTY_TOO_LARGE } from "@repo/services/limits";

export * from "@trpc/client";
