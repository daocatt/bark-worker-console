import {
  Form,
  useLoaderData,
  useActionData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "react-router";
import { requireAdmin } from "../auth/auth.server";
import { getDb } from "../drizzle/db.server";
import { settings } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import Nav from "../components/Nav";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request, context.cloudflare.env.database as D1Database);
  const db = getDb(context.cloudflare.env.database as D1Database);

  const sysSettings = await db.query.settings.findMany();
  const allowRegistration = sysSettings.find((s) => s.key === "allow_registration")?.value !== "false";
  const forceRegisterToUse = sysSettings.find((s) => s.key === "force_register_to_use")?.value === "true";

  return { admin, allowRegistration, forceRegisterToUse };
}

export async function action({ request, context }: ActionFunctionArgs) {
  await requireAdmin(request, context.cloudflare.env.database as D1Database);
  const db = getDb(context.cloudflare.env.database as D1Database);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "toggle_setting") {
    const settingKey = formData.get("settingKey")?.toString();
    const settingValue = formData.get("settingValue")?.toString() === "true" ? "false" : "true";
    if (!settingKey) return { error: "Missing setting key" };

    const allowedKeys = ["allow_registration", "force_register_to_use"];
    if (!allowedKeys.includes(settingKey)) {
      return { error: "Invalid setting key" };
    }

    const existing = await db.query.settings.findFirst({ where: eq(settings.key, settingKey) });
    if (existing) {
      await db.update(settings).set({ value: settingValue }).where(eq(settings.key, settingKey));
    } else {
      await db.insert(settings).values({ key: settingKey, value: settingValue });
    }

    return { success: `Setting updated successfully` };
  }

  if (intent === "manual_cleanup") {
    const { userDevices, devices } = await import("../drizzle/schema");
    const { notInArray } = await import("drizzle-orm");

    const linkedKeys = await db.query.userDevices.findMany({
      columns: { deviceKey: true }
    });
    const linkedKeyList = linkedKeys.map(k => k.deviceKey);

    let deletedCount = 0;
    if (linkedKeyList.length > 0) {
      const res = await db.delete(devices).where(notInArray(devices.key, linkedKeyList));
      deletedCount = res.meta?.changes ?? 0;
    } else {
      const res = await db.delete(devices);
      deletedCount = res.meta?.changes ?? 0;
    }

    return { success: `Manual cleanup completed! Deleted ${deletedCount} unlinked device key(s).` };
  }

  return null;
}

export default function AdminSettings() {
  const { admin, allowRegistration, forceRegisterToUse } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <Nav user={admin} />

        <div className="max-w-2xl mx-auto">
          <section className="bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)]">
            <h2 className="text-xl font-bold text-emerald-950 mb-6 flex items-center gap-2">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Global System Settings
            </h2>

            {actionData?.success && (
              <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-bold text-sm p-4 rounded-md mb-6 animate-pulse">
                {actionData.success}
              </div>
            )}

            {actionData?.error && (
              <div className="bg-red-50 border-2 border-red-200 text-red-700 font-bold text-sm p-4 rounded-md mb-6">
                {actionData.error}
              </div>
            )}

            <div className="space-y-6">
              {/* Registration Toggle */}
              <Form method="post" className="flex items-center justify-between p-5 bg-emerald-50/50 rounded-md border-2 border-emerald-100 hover:border-emerald-300 transition-all gap-4">
                <input type="hidden" name="intent" value="toggle_setting" />
                <input type="hidden" name="settingKey" value="allow_registration" />
                <input type="hidden" name="settingValue" value={allowRegistration ? "true" : "false"} />
                <div className="flex-1">
                  <p className="font-bold text-emerald-900 text-sm">Allow Public Registration</p>
                  <p className="text-xs font-medium text-emerald-600/80 mt-1 leading-relaxed">Whether new users can sign up to the console.</p>
                </div>
                <button type="submit" className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-all border-2 border-emerald-700 ${allowRegistration ? 'bg-emerald-500' : 'bg-gray-200 border-gray-400'}`}>
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${allowRegistration ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </Form>

              {/* Force Register Toggle */}
              <Form method="post" className="flex items-center justify-between p-5 bg-emerald-50/50 rounded-md border-2 border-emerald-100 hover:border-emerald-300 transition-all gap-4">
                <input type="hidden" name="intent" value="toggle_setting" />
                <input type="hidden" name="settingKey" value="force_register_to_use" />
                <input type="hidden" name="settingValue" value={forceRegisterToUse ? "true" : "false"} />
                <div className="flex-1">
                  <p className="font-bold text-emerald-900 text-sm">Force Registered Users</p>
                  <p className="text-xs font-medium text-emerald-600/80 mt-1 leading-relaxed">Push events only work if the device key is bound to a registered user.</p>
                </div>
                <button type="submit" className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-all border-2 border-emerald-700 ${forceRegisterToUse ? 'bg-teal-500 border-teal-700' : 'bg-gray-200 border-gray-400'}`}>
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${forceRegisterToUse ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </Form>

              {/* Manual Cleanup Button */}
              <Form method="post" className="flex items-center justify-between p-5 bg-amber-50/40 rounded-md border-2 border-amber-100 hover:border-amber-300 transition-all gap-4">
                <input type="hidden" name="intent" value="manual_cleanup" />
                <div className="flex-1">
                  <p className="font-bold text-amber-900 text-sm">Clean Up Unlinked Devices</p>
                  <p className="text-xs font-medium text-amber-700/85 mt-1 leading-relaxed">Manually delete all device keys that are not linked to any registered user account to optimize D1 storage.</p>
                </div>
                <button type="submit" className="bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all text-white font-bold text-xs py-2 px-4 rounded-md border-2 border-amber-700 shadow-[2px_2px_0_0_rgba(180,83,9,0.2)]">
                  Clean Now
                </button>
              </Form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
