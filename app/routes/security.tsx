import {
  Form,
  useLoaderData,
  useActionData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "react-router";
import bcrypt from "bcryptjs";
import { requireUser } from "../auth/auth.server";
import { getDb } from "../drizzle/db.server";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import Nav from "../components/Nav";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const user = await requireUser(request, context.cloudflare.env.database as D1Database);
  return { user };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const user = await requireUser(request, context.cloudflare.env.database as D1Database);
  const db = getDb(context.cloudflare.env.database as D1Database);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "change_password") {
    const currentPassword = formData.get("currentPassword")?.toString();
    const newPassword = formData.get("newPassword")?.toString();

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return { error: "Invalid password format" };
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return { error: "Incorrect current password" };
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    return { success: "Password changed successfully" };
  }

  return null;
}

export default function Security() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <Nav user={user} />

        <div className="max-w-md mx-auto">
          <section className="bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)]">
            <h2 className="text-xl font-bold text-emerald-950 mb-6 flex items-center gap-2">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Account Security
            </h2>

            <Form method="post" className="space-y-5">
              <input type="hidden" name="intent" value="change_password" />

              {actionData?.error && (
                <div className="bg-red-50 border-2 border-red-200 text-red-600 font-bold text-sm p-4 rounded-md">
                  {actionData.error}
                </div>
              )}
              {actionData?.success && (
                <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-bold text-sm p-4 rounded-md">
                  {actionData.success}
                </div>
              )}

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
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-3 rounded-md font-bold transition-all border-2 border-emerald-600 shadow-[3px_3px_0_0_rgba(4,120,87,1)] active:translate-y-1 active:translate-x-1 active:shadow-none">
                  Update Password
                </button>
              </div>
            </Form>
          </section>
        </div>
      </div>
    </div>
  );
}
