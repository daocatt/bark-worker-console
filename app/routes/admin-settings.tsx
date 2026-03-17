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
  const autoCleanupUnlinked = sysSettings.find((s) => s.key === "auto_cleanup_unlinked")?.value === "true";

  return { admin, allowRegistration, forceRegisterToUse, autoCleanupUnlinked };
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

    const existing = await db.query.settings.findFirst({ where: eq(settings.key, settingKey) });
    if (existing) {
      await db.update(settings).set({ value: settingValue }).where(eq(settings.key, settingKey));
    } else {
      await db.insert(settings).values({ key: settingKey, value: settingValue });
    }

    return { success: `Setting updated successfully` };
  }

  return null;
}

export default function AdminSettings() {
  const { admin, allowRegistration, forceRegisterToUse, autoCleanupUnlinked } = useLoaderData<typeof loader>();
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
              <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-bold text-sm p-4 rounded-md mb-6">
                {actionData.success}
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

              {/* Auto Cleanup Toggle */}
              <Form method="post" className="flex items-center justify-between p-5 bg-emerald-50/50 rounded-md border-2 border-emerald-100 hover:border-emerald-300 transition-all gap-4">
                <input type="hidden" name="intent" value="toggle_setting" />
                <input type="hidden" name="settingKey" value="auto_cleanup_unlinked" />
                <input type="hidden" name="settingValue" value={autoCleanupUnlinked ? "true" : "false"} />
                <div className="flex-1">
                  <p className="font-bold text-emerald-900 text-sm">Auto Cleanup Unlinked Devices</p>
                  <p className="text-xs font-medium text-emerald-600/80 mt-1 leading-relaxed">Automatically delete device keys that are not linked to any user every 72 hours.</p>
                </div>
                <button type="submit" className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-all border-2 border-emerald-700 ${autoCleanupUnlinked ? 'bg-amber-500 border-amber-700' : 'bg-gray-200 border-gray-400'}`}>
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${autoCleanupUnlinked ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </Form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
