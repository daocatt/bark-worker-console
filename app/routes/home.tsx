import {
  Form,
  useLoaderData,
  useActionData,
  useSubmit,
  Link,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "react-router";
import bcrypt from "bcryptjs";
import { requireUser } from "../auth/auth.server";
import { getDb } from "../drizzle/db.server";
import { userDevices, devices, users } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const user = await requireUser(request, context.cloudflare.env.database as D1Database);
  const db = getDb(context.cloudflare.env.database as D1Database);

  const userKeys = await db.query.userDevices.findMany({
    where: eq(userDevices.userId, user.id),
  });

  return { user, userKeys };
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

      // Check count
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
          if (parts.length > 0) {
            finalDeviceKey = parts[0];
          }
        } catch (e) {
          // Ignore URL parse errors
        }
      }

      // Check if device key exists in user_devices using the parsed key
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
    case "change_password": {
      const currentPassword = formData.get("currentPassword")?.toString();
      const newPassword = formData.get("newPassword")?.toString();

      if (!currentPassword || !newPassword || newPassword.length < 6) {
        return { error: "Invalid password format", intent };
      }

      const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!validPassword) {
        return { error: "Incorrect current password", intent };
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

      return { success: "Password changed successfully", intent };
    }
  }

  return null;
}

export default function Home() {
  const { user, userKeys } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const isAddKeyError = actionData?.intent === "add_key" && actionData.error;
  const isAddKeySuccess = actionData?.intent === "add_key" && actionData.success;

  const isPassError = actionData?.intent === "change_password" && actionData.error;
  const isPassSuccess = actionData?.intent === "change_password" && actionData.success;

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-300 font-sans p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-neutral-800/50 backdrop-blur-xl p-6 rounded-3xl border border-white/5 shadow-xl">
          <div className="flex gap-4 items-center">
            <span className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Hello, {user.username}
              </h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                {user.role === "admin" ? "Administrator Account" : "Standard User Account"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4 sm:mt-0">
            {user.role === "admin" && (
              <Link to="/admin" className="px-5 py-2.5 bg-neutral-700/50 hover:bg-neutral-600/50 text-neutral-200 rounded-xl text-sm font-medium transition-all border border-white/10 active:scale-95 shadow-md">
                Admin Panel
              </Link>
            )}
            <Form action="/logout" method="post">
              <button className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-sm font-medium transition-all border border-red-500/20 active:scale-95 shadow-md">
                Sign Out
              </button>
            </Form>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Main Content - Device Keys */}
          <div className="md:col-span-2 space-y-6">
            <section className="bg-neutral-800/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Your Device Keys</h2>
                <span className="text-sm px-3 py-1 bg-neutral-900 rounded-lg border border-white/5 font-mono text-neutral-400 shadow-inner">
                  {userKeys.length} / 5 Used
                </span>
              </div>

              {userKeys.length === 0 ? (
                <div className="text-center py-12 bg-neutral-900/50 rounded-2xl border border-dashed border-white/10 mt-4">
                  <div className="w-16 h-16 rounded-full bg-neutral-800/50 flex items-center justify-center mx-auto mb-4 border border-white/5">
                    <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <p className="text-neutral-500">No device keys added yet.</p>
                  <p className="text-neutral-600 text-sm mt-1">Add your first key below.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userKeys.map((key) => (
                    <div key={key.deviceKey} className="group flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/10 transition-all cursor-default">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-white/5 flex items-center justify-center text-blue-500 shadow-inner">
                          <svg className="w-5 h-5 opacity-70 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <code className="text-sm text-blue-300 font-mono tracking-wider">{key.deviceKey}</code>
                      </div>
                      <Form method="post" onSubmit={(e) => {
                        if (!confirm('Permanently remove this key from your account?')) e.preventDefault();
                      }}>
                        <input type="hidden" name="intent" value="delete_key" />
                        <input type="hidden" name="deviceKey" value={key.deviceKey} />
                        <button type="submit" className="p-2.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all shadow-sm">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </Form>
                    </div>
                  ))}
                </div>
              )}

              {userKeys.length < 5 && (
                <Form method="post" className="mt-8 pt-8 border-t border-white/5">
                  <input type="hidden" name="intent" value="add_key" />
                  <h3 className="text-sm font-medium text-neutral-400 mb-4 px-1">Add New Device Key</h3>

                  {isAddKeyError && <p className="text-red-400 text-sm mb-4 bg-red-500/10 p-3 rounded-xl border border-red-500/20">{actionData.error}</p>}
                  {isAddKeySuccess && <p className="text-green-400 text-sm mb-4 bg-green-500/10 p-3 rounded-xl border border-green-500/20">{actionData.success}</p>}

                  <div className="flex gap-3 flex-col sm:flex-row">
                    <input
                      type="text"
                      name="deviceKey"
                      required
                      placeholder="e.g. jBqX9w2z..."
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono text-sm shadow-inner"
                    />
                    <button type="submit" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-8 py-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-95 whitespace-nowrap">
                      Add to Account
                    </button>
                  </div>
                </Form>
              )}
            </section>
          </div>

          {/* Sidebar - Settings */}
          <div className="space-y-6">
            <section className="bg-neutral-800/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl sticky top-8">
              <h2 className="text-lg font-semibold text-white mb-6">Security</h2>

              <Form method="post" className="space-y-5">
                <input type="hidden" name="intent" value="change_password" />

                {isPassError && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{actionData.error}</p>}
                {isPassSuccess && <p className="text-green-400 text-sm bg-green-500/10 p-3 rounded-xl border border-green-500/20">{actionData.success}</p>}

                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider px-1">Current Password</label>
                  <input
                    type="password"
                    name="currentPassword"
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider px-1">New Password</label>
                  <input
                    type="password"
                    name="newPassword"
                    required
                    minLength={6}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm shadow-inner"
                  />
                </div>
                <div className="pt-2">
                  <button type="submit" className="w-full bg-neutral-700/50 hover:bg-neutral-600/50 border border-white/10 text-white px-4 py-3 rounded-xl font-medium transition-all active:scale-[0.98] shadow-md">
                    Update Password
                  </button>
                </div>
              </Form>
            </section>
          </div>

        </div>
      </div>
    </div>
  );
}
