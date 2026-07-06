import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  env: Env;
  cspNonce?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getSessionSecret(): string {
  const context = requestContextStorage.getStore();
  if (context?.env?.JWT_SECRET) {
    return context.env.JWT_SECRET;
  }
  if (typeof process !== "undefined" && process.env?.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  throw new Error("JWT_SECRET environment variable is required. Set it in wrangler.jsonc vars or .dev.vars");
}
