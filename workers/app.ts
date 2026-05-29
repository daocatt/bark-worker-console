import { createRequestHandler } from "react-router";
import { requestContextStorage } from "../app/auth/context-storage";

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

interface RateLimitData {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitData>();

function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  
  // Occasional map cleanup to prevent memory leaks
  if (rateLimitMap.size > 1000) {
    for (const [key, data] of rateLimitMap.entries()) {
      if (now > data.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }

  const data = rateLimitMap.get(ip);
  if (!data || now > data.resetTime) {
    rateLimitMap.set(ip, {
      count: 1,
      resetTime: now + windowMs,
    });
    return true;
  }

  if (data.count >= limit) {
    return false;
  }

  data.count++;
  return true;
}

export default {
  async fetch(request, env, ctx) {
    // 1. IP-Based Sliding Window Rate Limiting
    const ip = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
    const url = new URL(request.url);
    const isAuthRoutePost = (url.pathname === "/login" || url.pathname === "/register") && request.method === "POST";
    
    const limit = isAuthRoutePost ? 5 : 180;
    const windowMs = 60 * 1000; // 1 minute

    if (!checkRateLimit(ip, limit, windowMs)) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again in a minute." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        }
      );
    }

    // 2. Wrap the request inside requestContextStorage to bind variables for session handlers
    const response = await requestContextStorage.run({ env }, () => {
      return requestHandler(request, {
        cloudflare: { env, ctx },
      });
    });

    // 3. Inject Security Headers on all responses
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("X-Frame-Options", "DENY");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
    responseHeaders.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

    if (request.url.startsWith("https://")) {
      responseHeaders.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }

    // Modern CSP configured for hCaptcha and Local Vite HMR support
    responseHeaders.set(
      "Content-Security-Policy",
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.hcaptcha.com https://*.hcaptcha.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "img-src 'self' data: https:; " +
      "frame-src 'self' https://newassets.hcaptcha.com https://*.hcaptcha.com; " +
      "connect-src 'self' ws: wss: https://*.hcaptcha.com https://hcaptcha.com;"
    );

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
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
