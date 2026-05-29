import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  env: Env;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getSessionSecret(): string {
  const context = requestContextStorage.getStore();
  if (context?.env?.JWT_SECRET) {
    return context.env.JWT_SECRET;
  }
  // Fallback to process.env.JWT_SECRET if available
  if (typeof process !== "undefined" && process.env?.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  return "s3cr3t_b4rk";
}
