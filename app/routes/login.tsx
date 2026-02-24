import { Form, useActionData, useNavigation, Link, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import bcrypt from "bcryptjs";
import { getDb } from "../drizzle/db.server";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { commitSession, getSession } from "../auth/session.server";
import { getLoggedUser } from "../auth/auth.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
    const db = getDb(context.cloudflare.env.database as D1Database);

    // Initialization: Create admin if no users exist
    const existingUsers = await db.query.users.findFirst();
    if (!existingUsers) {
        const passwordHash = await bcrypt.hash("admin123", 10);
        await db.insert(users).values({
            username: "admin",
            passwordHash,
            role: "admin",
            createdAt: Math.floor(Date.now() / 1000),
        });
    }

    const user = await getLoggedUser(request, context.cloudflare.env.database as D1Database);
    if (user) {
        return redirect("/");
    }
    return null;
}

export async function action({ request, context }: ActionFunctionArgs) {
    const formData = await request.formData();
    const username = formData.get("username")?.toString();
    const password = formData.get("password")?.toString();

    if (!username || !password) {
        return { error: "Username and password are required" };
    }

    const db = getDb(context.cloudflare.env.database as D1Database);
    const user = await db.query.users.findFirst({
        where: eq(users.username, username),
    });

    if (!user) {
        return { error: "Invalid username or password" };
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
        return { error: "Invalid username or password" };
    }

    const session = await getSession(request.headers.get("Cookie"));
    session.set("userId", user.id);

    return redirect("/", {
        headers: {
            "Set-Cookie": await commitSession(session),
        },
    });
}

export default function Login() {
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    return (
        <div className="flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white border-2 border-emerald-200 rounded-lg p-8 shadow-[8px_8px_0_0_rgba(16,185,129,0.15)] my-12 transition-all">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-md bg-emerald-500 mb-6 border-2 border-emerald-700 shadow-[2px_2px_0_0_rgba(4,120,87,1)]">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-emerald-950">Welcome Back</h1>
                    <p className="text-emerald-700 font-medium mt-2">Sign in to manage your Bark keys</p>
                </div>

                <Form method="post" className="space-y-6">
                    {actionData?.error && (
                        <div className="bg-red-50 border-2 border-red-200 text-red-600 font-bold text-sm p-4 rounded-md flex items-center gap-3">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            {actionData.error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label
                                htmlFor="username"
                                className="block text-sm font-bold text-emerald-800 mb-2"
                            >
                                Username
                            </label>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                autoComplete="username"
                                required
                                className="w-full px-4 py-3 bg-white border-2 border-emerald-200 rounded-md focus:border-emerald-500 focus:shadow-[2px_2px_0_0_rgba(16,185,129,0.3)] transition-all text-emerald-950 font-medium placeholder-emerald-300 outline-none"
                                placeholder="Enter your username"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="block text-sm font-bold text-emerald-800 mb-2"
                            >
                                Password
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="w-full px-4 py-3 bg-white border-2 border-emerald-200 rounded-md focus:border-emerald-500 focus:shadow-[2px_2px_0_0_rgba(16,185,129,0.3)] transition-all text-emerald-950 font-medium placeholder-emerald-300 outline-none"
                                placeholder="Enter your password"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 px-4 rounded-md transition-all border-2 border-emerald-700 shadow-[3px_3px_0_0_rgba(4,120,87,1)] active:translate-y-1 active:translate-x-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:translate-x-0 disabled:active:shadow-[3px_3px_0_0_rgba(4,120,87,1)]"
                    >
                        {isSubmitting ? "Signing in..." : "Sign In"}
                    </button>
                </Form>

                <p className="text-center text-emerald-700 font-medium mt-8">
                    Don't have an account?{" "}
                    <Link to="/register" className="text-emerald-500 hover:text-emerald-600 transition-colors font-bold underline decoration-emerald-500/30 underline-offset-4">
                        Register now
                    </Link>
                </p>
            </div>
        </div>
    );
}
