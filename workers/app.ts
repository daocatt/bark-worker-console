import { createRequestHandler } from "react-router";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
  async scheduled(event, env, ctx) {
    // Import DB logic dynamically to avoid bundling issues if possible, 
    // but here we can just import it since it's a small app.
    const { getDb } = await import("../app/drizzle/db.server");
    const { settings, userDevices, devices } = await import("../app/drizzle/schema");
    const { eq, notInArray, sql } = await import("drizzle-orm");

    const db = getDb(env.database);
    
    // Check settings
    const [autoCleanup, forceRegistered] = await Promise.all([
      db.query.settings.findFirst({ where: eq(settings.key, "auto_cleanup_unlinked") }),
      db.query.settings.findFirst({ where: eq(settings.key, "force_registered_users") })
    ]);

    // ONLY execute cleanup if BOTH settings are true.
    // This prevents accidental deletion of anonymous device keys if force_registered is OFF.
    if (autoCleanup?.value === "true" && forceRegistered?.value === "true") {
      console.log("Running auto-cleanup for unlinked device keys (Force Registered mode is ON)...");
      
      const linkedKeys = await db.query.userDevices.findMany({
        columns: { deviceKey: true }
      });
      const linkedKeyList = linkedKeys.map(k => k.deviceKey);

      if (linkedKeyList.length > 0) {
        await db.delete(devices).where(notInArray(devices.key, linkedKeyList));
      } else {
        await db.delete(devices);
      }
      
      console.log("Auto-cleanup finished.");
    } else {
      console.log("Auto-cleanup skipped: Either disabled or Force Registered mode is OFF.");
    }
  }
} satisfies ExportedHandler<Env>;
