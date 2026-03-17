import {
  Form,
  useLoaderData,
  useActionData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "react-router";
import { requireUser } from "../auth/auth.server";
import { getDb } from "../drizzle/db.server";
import { userDevices } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import Nav from "../components/Nav";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const user = await requireUser(request, context.cloudflare.env.database as D1Database);
  const db = getDb(context.cloudflare.env.database as D1Database);

  const userKeys = await db.query.userDevices.findMany({
    where: eq(userDevices.userId, user.id),
  });

  const barkApiUrl = context.cloudflare.env.BARK_API_URL || "";

  return { user, userKeys, barkApiUrl };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const user = await requireUser(request, context.cloudflare.env.database as D1Database);
  const db = getDb(context.cloudflare.env.database as D1Database);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  switch (intent) {
    case "add_key": {
      const deviceKey = formData.get("deviceKey")?.toString().trim();
      if (!deviceKey) return { error: "Device key is required", intent };

      const existingKeys = await db.query.userDevices.findMany({
        where: eq(userDevices.userId, user.id),
      });

      if (existingKeys.length >= 5) {
        return { error: "You can only have up to 5 device keys", intent };
      }

      let finalDeviceKey = deviceKey;
      if (finalDeviceKey.startsWith("http://") || finalDeviceKey.startsWith("https://")) {
        try {
          const url = new URL(finalDeviceKey);
          const parts = url.pathname.split("/").filter(Boolean);
          if (parts.length > 0) finalDeviceKey = parts[0];
        } catch (e) {}
      }

      const isRegistered = await db.query.userDevices.findFirst({
        where: eq(userDevices.deviceKey, finalDeviceKey),
      });

      if (isRegistered && isRegistered.userId !== user.id) {
        return { error: "Device key is already registered to another account", intent };
      }

      if (isRegistered && isRegistered.userId === user.id) {
        return { error: "You already have this device key", intent };
      }

      await db.insert(userDevices).values({
        userId: user.id,
        deviceKey: finalDeviceKey,
      });

      return { success: "Device key added successfully", intent };
    }
    case "delete_key": {
      const deviceKey = formData.get("deviceKey")?.toString();
      if (!deviceKey) return { error: "Device key is required", intent };

      await db.delete(userDevices).where(
        and(eq(userDevices.userId, user.id), eq(userDevices.deviceKey, deviceKey))
      );

      return { success: "Device key removed", intent };
    }
    case "test_push": {
      const deviceKey = formData.get("deviceKey")?.toString();
      const barkApiUrl = context.cloudflare.env.BARK_API_URL;

      if (!barkApiUrl) return { error: "BARK_API_URL is not configured", intent };
      if (!deviceKey) return { error: "Device key is missing", intent };

      try {
        const testUrl = `${barkApiUrl.replace(/\/$/, "")}/${deviceKey}/来自bark-worker-console的测试`;
        const resp = await fetch(testUrl);
        const data = await resp.json() as any;
        if (resp.ok) {
          return { success: `Test push sent! Server responsive: ${data.message || 'success'}`, intent };
        } else {
          return { error: `Push failed: ${data.message || resp.statusText}`, intent };
        }
      } catch (err) {
        return { error: `Failed to connect to Bark server: ${(err as Error).message}`, intent };
      }
    }
  }

  return null;
}

export default function Home() {
  const { user, userKeys, barkApiUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const isAddKeyError = actionData?.intent === "add_key" && actionData.error;
  const isAddKeySuccess = actionData?.intent === "add_key" && actionData.success;
  
  const isTestError = actionData?.intent === "test_push" && actionData.error;
  const isTestSuccess = actionData?.intent === "test_push" && actionData.success;

  return (
    <div className="p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <Nav user={user} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Main Content - Device Keys */}
          <div className="md:col-span-2 space-y-6">
            <section className="bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-emerald-950">Your Device Keys</h2>
                <span className="text-sm px-3 py-1 bg-emerald-50 rounded-md border-2 border-emerald-200 font-mono font-bold text-emerald-700">
                  {userKeys.length} / 5 Used
                </span>
              </div>

              {(isTestError || isTestSuccess) && (
                <div className={`mb-4 p-3 rounded-md border-2 text-sm font-medium ${isTestError ? 'bg-red-50 border-red-100 text-red-600' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                   {isTestError || isTestSuccess}
                </div>
              )}

              {userKeys.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-md border-2 border-dashed border-emerald-200 mt-4 shadow-[2px_2px_0_0_rgba(16,185,129,0.05)]">
                  <p className="text-emerald-800 font-bold">No device keys added yet.</p>
                  <p className="text-emerald-600/80 font-medium text-sm mt-1">Add your first key below.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {userKeys.map((key) => (
                    <div key={key.deviceKey} className="group flex items-center justify-between p-4 bg-emerald-50/50 rounded-md border-2 border-emerald-100 hover:border-emerald-300 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-md bg-white border-2 border-emerald-200 flex items-center justify-center text-emerald-600 shadow-[2px_2px_0_0_rgba(16,185,129,0.1)]">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <code className="text-sm font-bold text-emerald-800 font-mono tracking-wider">{key.deviceKey}</code>
                      </div>
                      <div className="flex items-center gap-2">
                         <Form method="post">
                          <input type="hidden" name="intent" value="test_push" />
                          <input type="hidden" name="deviceKey" value={key.deviceKey} />
                          <button type="submit" title="Send test notification" className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-md transition-all border-2 border-transparent hover:border-emerald-200">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                          </button>
                        </Form>
                        <Form method="post" onSubmit={(e) => {
                          if (!confirm('Remove this key?')) e.preventDefault();
                        }}>
                          <input type="hidden" name="intent" value="delete_key" />
                          <input type="hidden" name="deviceKey" value={key.deviceKey} />
                          <button type="submit" title="Remove key" className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all border-2 border-transparent hover:border-red-200">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </Form>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {userKeys.length < 5 && (
                <Form method="post" className="mt-8 pt-8 border-t-2 border-dashed border-emerald-100">
                  <input type="hidden" name="intent" value="add_key" />
                  <h3 className="text-sm font-bold text-emerald-800 mb-4">Add Device Key</h3>
                  {isAddKeyError && <p className="text-red-600 font-medium text-sm mb-4 bg-red-50 px-3 py-2 rounded border-2 border-red-100">{isAddKeyError}</p>}
                  {isAddKeySuccess && <p className="text-emerald-700 font-medium text-sm mb-4 bg-emerald-50 px-3 py-2 rounded border-2 border-emerald-100">{isAddKeySuccess}</p>}
                  <div className="flex gap-3">
                    <input type="text" name="deviceKey" required placeholder="Device Key or URL" className="flex-1 bg-white border-2 border-emerald-200 rounded-md px-4 py-2 outline-none focus:border-emerald-500 font-mono text-sm" />
                    <button type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-2 rounded-md font-bold transition-all border-2 border-emerald-600 shadow-[2px_2px_0_0_rgba(4,120,87,1)] active:translate-y-1 active:shadow-none">Add</button>
                  </div>
                </Form>
              )}
            </section>
          </div>

          {/* Sidebar - Info */}
          <div className="space-y-6">
            <section className="bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)] sticky top-8">
              <h2 className="text-lg font-bold text-emerald-950 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Bark Connectivity
              </h2>
              
              <div className="space-y-4">
                {barkApiUrl ? (
                  <div className="p-4 bg-emerald-50 rounded-md border-2 border-emerald-100">
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-1">Server URL</p>
                    <code className="text-sm font-bold text-emerald-900 break-all select-all font-mono">
                      {barkApiUrl}
                    </code>
                    <p className="text-xs text-emerald-600/70 mt-3 leading-relaxed">
                      Copy this URL into your <strong>Bark iOS App</strong> under "Add Server" to connect to this instance.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 rounded-md border-2 border-amber-200">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">Configuration Needed</p>
                    <p className="text-sm text-amber-800 leading-relaxed font-medium">
                      <code>BARK_API_URL</code> is not configured. Please add it to your <code>.env</code> or <code>wrangler.jsonc</code>.
                    </p>
                  </div>
                )}

                <div className="pt-2">
                   <div className="flex items-center gap-2 text-emerald-700">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-xs font-medium">Auto-binding enabled</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-700 mt-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-xs font-medium">Secured with APNs</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
