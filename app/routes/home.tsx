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
    <div className="p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)] transition-all">
          <div className="flex gap-4 items-center">
            <span className="w-12 h-12 rounded-md bg-emerald-500 flex items-center justify-center border-2 border-emerald-700 shadow-[2px_2px_0_0_rgba(4,120,87,1)]">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl font-bold text-emerald-950 tracking-tight">
                Hello, {user.username}
              </h1>
              <p className="text-sm font-medium text-emerald-600/80 mt-0.5">
                {user.role === "admin" ? "Administrator Account" : "Standard User Account"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4 sm:mt-0">
            {user.role === "admin" && (
              <Link to="/admin" className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-md text-sm font-bold transition-all border-2 border-emerald-200 shadow-[2px_2px_0_0_rgba(16,185,129,0.2)] active:translate-y-1 active:translate-x-1 active:shadow-none">
                Admin Panel
              </Link>
            )}
            <Form action="/logout" method="post">
              <button className="px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-md text-sm font-bold transition-all border-2 border-red-200 shadow-[2px_2px_0_0_rgba(239,68,68,0.2)] active:translate-y-1 active:translate-x-1 active:shadow-none">
                Sign Out
              </button>
            </Form>
          </div>
        </header>

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

              {userKeys.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-md border-2 border-dashed border-emerald-200 mt-4 shadow-[2px_2px_0_0_rgba(16,185,129,0.05)]">
                  <div className="w-16 h-16 rounded-md bg-emerald-50 flex items-center justify-center mx-auto mb-4 border-2 border-emerald-100 shadow-[2px_2px_0_0_rgba(16,185,129,0.1)]">
                    <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <p className="text-emerald-800 font-bold">No device keys added yet.</p>
                  <p className="text-emerald-600/80 font-medium text-sm mt-1">Add your first key below.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {userKeys.map((key) => (
                    <div key={key.deviceKey} className="group flex items-center justify-between p-4 bg-emerald-50/50 rounded-md border-2 border-emerald-100 hover:border-emerald-300 hover:shadow-[2px_2px_0_0_rgba(16,185,129,0.15)] transition-all cursor-default">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-md bg-white border-2 border-emerald-200 flex items-center justify-center text-emerald-600 shadow-[2px_2px_0_0_rgba(16,185,129,0.1)]">
                          <svg className="w-5 h-5 opacity-70 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <code className="text-sm font-bold text-emerald-800 font-mono tracking-wider">{key.deviceKey}</code>
                      </div>
                      <Form method="post" onSubmit={(e) => {
                        if (!confirm('Permanently remove this key from your account?')) e.preventDefault();
                      }}>
                        <input type="hidden" name="intent" value="delete_key" />
                        <input type="hidden" name="deviceKey" value={key.deviceKey} />
                        <button type="submit" className="p-2 border-2 border-transparent text-emerald-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 rounded-md transition-all shadow-sm">
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
                <Form method="post" className="mt-8 pt-8 border-t-2 border-dashed border-emerald-100">
                  <input type="hidden" name="intent" value="add_key" />
                  <h3 className="text-sm font-bold text-emerald-800 mb-4 px-1">Add New Device Key</h3>

                  {isAddKeyError && <p className="text-red-600 font-medium text-sm mb-4 bg-red-50 py-2 px-3 rounded-md border-2 border-red-200">{actionData.error}</p>}
                  {isAddKeySuccess && <p className="text-emerald-700 font-medium text-sm mb-4 bg-emerald-50 py-2 px-3 rounded-md border-2 border-emerald-200">{actionData.success}</p>}

                  <div className="flex gap-3 flex-col sm:flex-row">
                    <input
                      type="text"
                      name="deviceKey"
                      required
                      placeholder="e.g. jBqX9w2z..."
                      className="flex-1 bg-white border-2 border-emerald-200 rounded-md px-4 py-3 outline-none focus:border-emerald-500 focus:shadow-[2px_2px_0_0_rgba(16,185,129,0.3)] transition-all font-mono text-sm text-emerald-950 font-medium placeholder:text-emerald-300"
                    />
                    <button type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-white px-8 py-3 rounded-md font-bold transition-all border-2 border-emerald-600 shadow-[3px_3px_0_0_rgba(4,120,87,1)] active:translate-y-1 active:translate-x-1 active:shadow-none whitespace-nowrap">
                      Add to Account
                    </button>
                  </div>
                </Form>
              )}
            </section>
          </div>

          {/* Sidebar - Settings */}
          <div className="space-y-6">
            <section className="bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)] sticky top-8">
              <h2 className="text-lg font-bold text-emerald-950 mb-6">Security</h2>

              <Form method="post" className="space-y-5">
                <input type="hidden" name="intent" value="change_password" />

                {isPassError && <p className="text-red-600 font-medium text-sm bg-red-50 py-2 px-3 rounded-md border-2 border-red-200">{actionData.error}</p>}
                {isPassSuccess && <p className="text-emerald-700 font-medium text-sm bg-emerald-50 py-2 px-3 rounded-md border-2 border-emerald-200">{actionData.success}</p>}

                <div>
                  <label className="block text-xs font-bold text-emerald-700 mb-2 uppercase tracking-widest px-1">Current Password</label>
                  <input
                    type="password"
                    name="currentPassword"
                    required
                    className="w-full bg-white border-2 border-emerald-200 rounded-md px-4 py-3 outline-none focus:border-emerald-500 focus:shadow-[2px_2px_0_0_rgba(16,185,129,0.3)] transition-all text-sm font-medium text-emerald-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-700 mb-2 uppercase tracking-widest px-1">New Password</label>
                  <input
                    type="password"
                    name="newPassword"
                    required
                    minLength={6}
                    className="w-full bg-white border-2 border-emerald-200 rounded-md px-4 py-3 outline-none focus:border-emerald-500 focus:shadow-[2px_2px_0_0_rgba(16,185,129,0.3)] transition-all text-sm font-medium text-emerald-950"
                  />
                </div>
                <div className="pt-2">
                  <button type="submit" className="w-full bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 text-emerald-800 px-4 py-3 rounded-md font-bold transition-all shadow-[2px_2px_0_0_rgba(16,185,129,0.2)] active:translate-y-1 active:translate-x-1 active:shadow-none">
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
