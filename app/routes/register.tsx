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
        <div className="flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white border-2 border-emerald-200 rounded-lg p-8 shadow-[8px_8px_0_0_rgba(16,185,129,0.15)] my-12 transition-all">
                <div className="text-center mb-10">
                    <img 
                        src="/bark-console-logo.png" 
                        alt="Bark Logo" 
                        className="w-20 h-20 mx-auto mb-6 drop-shadow-sm"
                    />
                    <h1 className="text-3xl font-extrabold text-emerald-950 tracking-tight">Create Account</h1>
                    <p className="text-emerald-600/70 font-bold text-sm uppercase tracking-widest mt-2">Join to manage your Bark keys</p>
                </div>

                {isDisabled ? (
                    <div className="text-center p-6 bg-red-50 border-2 border-red-200 rounded-md">
                        <p className="text-red-600 font-bold">Registration is currently disabled by administrators.</p>
                    </div>
                ) : (
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
                                    placeholder="Choose a username"
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
                                    autoComplete="new-password"
                                    required
                                    className="w-full px-4 py-3 bg-white border-2 border-emerald-200 rounded-md focus:border-emerald-500 focus:shadow-[2px_2px_0_0_rgba(16,185,129,0.3)] transition-all text-emerald-950 font-medium placeholder-emerald-300 outline-none"
                                    placeholder="Create a password (min 6 chars)"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 px-4 rounded-md transition-all border-2 border-emerald-700 shadow-[3px_3px_0_0_rgba(4,120,87,1)] active:translate-y-1 active:translate-x-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:translate-x-0 disabled:active:shadow-[3px_3px_0_0_rgba(4,120,87,1)]"
                        >
                            {isSubmitting ? "Creating account..." : "Sign Up"}
                        </button>
                    </Form>
                )}

                <p className="text-center text-emerald-700 font-medium mt-8">
                    Already have an account?{" "}
                    <Link to="/login" className="text-emerald-500 hover:text-emerald-600 transition-colors font-bold underline decoration-emerald-500/30 underline-offset-4">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
