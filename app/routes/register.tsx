import { Form, useActionData, useLoaderData, useNavigation, Link, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import bcrypt from "bcryptjs";
import { getDb } from "../drizzle/db.server";
import { users, settings } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { commitSession, getSession } from "../auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
    const db = getDb(context.cloudflare.env.database as D1Database);

    const allowRegSetting = await db.query.settings.findFirst({
        where: eq(settings.key, "allow_registration"),
    });

    const isRegistrationAllowed = allowRegSetting?.value !== "false";

    if (!isRegistrationAllowed) {
        return { RegistrationDisabled: true };
    }
    return { RegistrationDisabled: false };
}

export async function action({ request, context }: ActionFunctionArgs) {
    const db = getDb(context.cloudflare.env.database as D1Database);

    const allowRegSetting = await db.query.settings.findFirst({
        where: eq(settings.key, "allow_registration"),
    });

    if (allowRegSetting?.value === "false") {
        return { error: "Registration is currently disabled" };
    }

    const formData = await request.formData();
    const username = formData.get("username")?.toString();
    const password = formData.get("password")?.toString();

    if (!username || !password || username.length < 3 || password.length < 6) {
        return { error: "Username must be at least 3 chars and password 6 chars" };
    }

    const existingUser = await db.query.users.findFirst({
        where: eq(users.username, username),
    });

    if (existingUser) {
        return { error: "Username already taken" };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await db.insert(users).values({
        username,
        passwordHash,
        createdAt: Math.floor(Date.now() / 1000),
    }).returning();

    const session = await getSession(request.headers.get("Cookie"));
    session.set("userId", newUser.id);

    return redirect("/", {
        headers: {
            "Set-Cookie": await commitSession(session),
        },
    });
}

export default function Register() {
    const actionData = useActionData<typeof action>();
    const loaderData = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    const isDisabled = loaderData?.RegistrationDisabled;

    return (
        <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-neutral-800/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 mb-6 shadow-lg shadow-blue-500/30">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">Create Account</h1>
                    <p className="text-neutral-400 mt-2">Join to manage your Bark keys</p>
                </div>

                {isDisabled ? (
                    <div className="text-center p-6 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <p className="text-red-400 font-medium">Registration is currently disabled by administrators.</p>
                    </div>
                ) : (
                    <Form method="post" className="space-y-6">
                        {actionData?.error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-xl flex items-center gap-3">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                {actionData.error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label
                                    htmlFor="username"
                                    className="block text-sm font-medium text-neutral-300 mb-2"
                                >
                                    Username
                                </label>
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    autoComplete="username"
                                    required
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-white placeholder-neutral-500 outline-none"
                                    placeholder="Choose a username"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="password"
                                    className="block text-sm font-medium text-neutral-300 mb-2"
                                >
                                    Password
                                </label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-white placeholder-neutral-500 outline-none"
                                    placeholder="Create a password (min 6 chars)"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? "Creating account..." : "Sign Up"}
                        </button>
                    </Form>
                )}

                <p className="text-center text-neutral-400 mt-8">
                    Already have an account?{" "}
                    <Link to="/login" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
