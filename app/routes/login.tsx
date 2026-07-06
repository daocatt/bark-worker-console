import { Form, useActionData, useLoaderData, useNavigation, Link, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useEffect, useRef } from "react";
import bcrypt from "bcryptjs";
import { getDb } from "../drizzle/db.server";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { commitSession, getSession } from "../auth/session.server";
import { getLoggedUser } from "../auth/auth.server";

function generateRandomPassword(length: number = 16): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*";
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => chars[b % chars.length]).join("");
}

export async function loader({ request, context }: LoaderFunctionArgs) {
    const db = getDb(context.cloudflare.env.database as D1Database);

    const existingUsers = await db.query.users.findFirst();
    if (!existingUsers) {
        const randomPassword = generateRandomPassword();
        const passwordHash = await bcrypt.hash(randomPassword, 10);
        await db.insert(users).values({
            username: "admin",
            passwordHash,
            role: "admin",
            createdAt: Math.floor(Date.now() / 1000),
            mustChangePassword: 1,
        });
        console.log("===========================================");
        console.log("Initial admin account created!");
        console.log(`Username: admin`);
        console.log(`Password: ${randomPassword}`);
        console.log("Please change this password after first login.");
        console.log("===========================================");
    }

    const user = await getLoggedUser(request, context.cloudflare.env.database as D1Database);
    if (user) {
        if ((user as any).mustChangePassword) {
            return redirect("/security");
        }
        return redirect("/");
    }
    
    return {
        hcaptchaSitekey: (context.cloudflare.env.HCAPTCHA_SITEKEY as string) || null,
    };
}

export async function action({ request, context }: ActionFunctionArgs) {
    const formData = await request.formData();
    const username = formData.get("username")?.toString();
    const password = formData.get("password")?.toString();

    if (!username || !password) {
        return { error: "Username and password are required" };
    }

    // Optional hCaptcha Token Verification
    const hcaptchaSecret = context.cloudflare.env.HCAPTCHA_SECRET;
    const hcaptchaSitekey = context.cloudflare.env.HCAPTCHA_SITEKEY;

    if (hcaptchaSecret && hcaptchaSitekey) {
        const captchaResponse = formData.get("h-captcha-response")?.toString();
        if (!captchaResponse) {
            return { error: "Please complete the CAPTCHA challenge" };
        }

        try {
            const verifyUrl = "https://hcaptcha.com/siteverify";
            const response = await fetch(verifyUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `secret=${encodeURIComponent(hcaptchaSecret)}&response=${encodeURIComponent(captchaResponse)}`,
            });
            const result = (await response.json()) as { success: boolean };
            if (!result.success) {
                return { error: "CAPTCHA verification failed. Please try again." };
            }
        } catch (err) {
            return { error: "CAPTCHA verification service error. Please try again." };
        }
    }

    const db = getDb(context.cloudflare.env.database as D1Database);
    const user = await db.query.users.findFirst({
        where: eq(users.username, username),
    });

    if (!user) {
        await bcrypt.hash("dummy-password-to-burn-cpu", 10);
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
    const loaderData = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";
    const hcaptchaSitekey = loaderData?.hcaptchaSitekey;
    const captchaRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<any>(null);

    useEffect(() => {
        if (!hcaptchaSitekey) return;

        let isMounted = true;

        const loadScriptAndRender = () => {
            if (typeof window === "undefined") return;

            // Define explicit onload callback
            (window as any).onloadHCaptchaCallback = () => {
                if (isMounted && captchaRef.current) {
                    try {
                        widgetIdRef.current = (window as any).hcaptcha.render(captchaRef.current, {
                            sitekey: hcaptchaSitekey,
                            theme: "light",
                        });
                    } catch (e) {
                        console.error("hCaptcha render error:", e);
                    }
                }
            };

            if (!(window as any).hcaptcha) {
                const script = document.createElement("script");
                script.src = "https://js.hcaptcha.com/1/api.js?onload=onloadHCaptchaCallback&render=explicit";
                script.async = true;
                script.defer = true;
                document.body.appendChild(script);
            } else {
                // If script already loaded, explicitly render the widget
                if (captchaRef.current && (window as any).hcaptcha.render) {
                    try {
                        captchaRef.current.innerHTML = "";
                        widgetIdRef.current = (window as any).hcaptcha.render(captchaRef.current, {
                            sitekey: hcaptchaSitekey,
                            theme: "light",
                        });
                    } catch (e) {
                        console.error("hCaptcha explicit rerender error:", e);
                    }
                }
            }
        };

        loadScriptAndRender();

        return () => {
            isMounted = false;
            if (typeof window !== "undefined") {
                delete (window as any).onloadHCaptchaCallback;
            }
        };
    }, [hcaptchaSitekey]);

    return (
        <div className="flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white border-2 border-emerald-200 rounded-lg p-8 shadow-[8px_8px_0_0_rgba(16,185,129,0.15)] my-12 transition-all">
                <div className="text-center mb-10">
                    <img 
                        src="/bark-console-logo.png" 
                        alt="Bark Logo" 
                        className="w-20 h-20 mx-auto mb-6 bg-emerald-600 p-3 rounded-2xl border-2 border-emerald-500 shadow-lg"
                    />
                    <h1 className="text-3xl font-extrabold text-emerald-950 tracking-tight">Welcome Back</h1>
                    <p className="text-emerald-600/70 font-bold text-sm uppercase tracking-widest mt-2">Log in to your account</p>
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

                    {hcaptchaSitekey && (
                        <div className="flex justify-center mb-6">
                            <div ref={captchaRef}></div>
                        </div>
                    )}

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
