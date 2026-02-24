import {
    Form,
    useLoaderData,
    useActionData,
    Link,
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "react-router";
import { useState } from "react";
import { requireAdmin } from "../auth/auth.server";
import { getDb } from "../drizzle/db.server";
import { userDevices, settings, users, devices } from "../drizzle/schema";
import { eq, not } from "drizzle-orm";

export async function loader({ request, context }: LoaderFunctionArgs) {
    const admin = await requireAdmin(request, context.cloudflare.env.database as D1Database);
    const db = getDb(context.cloudflare.env.database as D1Database);

    const allUsers = await db.query.users.findMany(); // Get all to resolve names
    const otherUsers = allUsers.filter(u => u.id !== admin.id);

    const allUserDevices = await db.query.userDevices.findMany();

    // combine
    const usersWithKeys = otherUsers.map((u) => ({
        ...u,
        keys: allUserDevices.filter((d) => d.userId === u.id),
    }));

    const allDevices = await db.query.devices.findMany();
    // map raw devices
    const rawDevices = allDevices.map(d => {
        const mapping = allUserDevices.find(ud => ud.deviceKey === d.key);
        let ownerName = null;
        if (mapping) {
            const owner = allUsers.find(u => u.id === mapping.userId);
            ownerName = owner?.username || "Unknown";
        }
        return {
            ...d,
            ownerName
        };
    });

    const sysSettings = await db.query.settings.findMany();
    const allowRegistration = sysSettings.find((s) => s.key === "allow_registration")?.value !== "false";
    const forceRegisterToUse = sysSettings.find((s) => s.key === "force_register_to_use")?.value === "true";

    return { usersWithKeys, rawDevices, allowRegistration, forceRegisterToUse };
}

export async function action({ request, context }: ActionFunctionArgs) {
    await requireAdmin(request, context.cloudflare.env.database as D1Database);
    const db = getDb(context.cloudflare.env.database as D1Database);
    const formData = await request.formData();
    const intent = formData.get("intent")?.toString();

    switch (intent) {
        case "toggle_setting": {
            const settingKey = formData.get("settingKey")?.toString();
            const settingValue = formData.get("settingValue")?.toString() === "true" ? "false" : "true";
            if (!settingKey) return { error: "Missing setting key" };

            const existing = await db.query.settings.findFirst({ where: eq(settings.key, settingKey) });
            if (existing) {
                await db.update(settings).set({ value: settingValue }).where(eq(settings.key, settingKey));
            } else {
                await db.insert(settings).values({ key: settingKey, value: settingValue });
            }

            return { success: `Setting ${settingKey} updated to ${settingValue}` };
        }
        case "delete_user": {
            const userId = Number(formData.get("userId"));
            if (!userId) return { error: "Missing user ID" };

            await db.delete(users).where(eq(users.id, userId));
            // keys deleted automatically if foreign key cascade works, otherwise we manual delete
            await db.delete(userDevices).where(eq(userDevices.userId, userId));

            return { success: "User deleted" };
        }
        case "delete_key": {
            const deviceKey = formData.get("deviceKey")?.toString();
            if (!deviceKey) return { error: "Missing device key" };

            await db.delete(userDevices).where(eq(userDevices.deviceKey, deviceKey));
            return { success: "Key deleted" };
        }
        case "delete_raw_device": {
            const deviceKey = formData.get("deviceKey")?.toString();
            if (!deviceKey) return { error: "Missing device key" };

            await db.delete(devices).where(eq(devices.key, deviceKey));
            // Cascade unbind user assignment
            await db.delete(userDevices).where(eq(userDevices.deviceKey, deviceKey));

            return { success: "Raw device removed from server" };
        }
    }

    return null;
}

export default function Admin() {
    const { usersWithKeys, rawDevices, allowRegistration, forceRegisterToUse } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const [activeTab, setActiveTab] = useState<"users" | "devices">("users");

    return (
        <div className="p-4 sm:p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)] transition-all">
                    <div className="flex gap-4 items-center">
                        <span className="w-12 h-12 rounded-md bg-emerald-500 flex items-center justify-center border-2 border-emerald-700 shadow-[2px_2px_0_0_rgba(4,120,87,1)]">
                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </span>
                        <div>
                            <h1 className="text-2xl font-bold text-emerald-950 tracking-tight">
                                System Administration
                            </h1>
                            <p className="text-sm font-medium text-emerald-600/80 mt-0.5">
                                Manage users and settings
                            </p>
                        </div>
                    </div>
                    <Link to="/" className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-md text-sm font-bold transition-all border-2 border-emerald-200 shadow-[2px_2px_0_0_rgba(16,185,129,0.2)] active:translate-y-1 active:translate-x-1 active:shadow-none">
                        Back to Dashboard
                    </Link>
                </header>

                {actionData && (
                    <div className={`p-4 rounded-md border-2 ${actionData.error ? 'bg-red-50 border-red-200 text-red-600 font-medium' : 'bg-emerald-50 border-emerald-200 text-emerald-700 font-medium'}`}>
                        {actionData.error || actionData.success}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        {/* Segmented Control / Tabs */}
                        <div className="bg-white border-2 border-emerald-200 rounded-lg p-2 flex items-center space-x-2 shadow-[2px_2px_0_0_rgba(16,185,129,0.1)]">
                            <button
                                onClick={() => setActiveTab("users")}
                                className={`flex-1 flex justify-center items-center py-2.5 text-sm font-bold rounded-md transition-all ${activeTab === "users" ? "bg-emerald-500 text-white shadow-[2px_2px_0_0_rgba(4,120,87,1)] border-2 border-emerald-700" : "text-emerald-700 hover:bg-emerald-50 border-2 border-transparent"}`}
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                Users Management
                            </button>
                            <button
                                onClick={() => setActiveTab("devices")}
                                className={`flex-1 flex justify-center items-center py-2.5 text-sm font-bold rounded-md transition-all ${activeTab === "devices" ? "bg-emerald-500 text-white shadow-[2px_2px_0_0_rgba(4,120,87,1)] border-2 border-emerald-700" : "text-emerald-700 hover:bg-emerald-50 border-2 border-transparent"}`}
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                                </svg>
                                Global Devices
                            </button>
                        </div>

                        {/* Users Table section */}
                        {activeTab === "users" && (
                            <section className="bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)] animate-in fade-in zoom-in-95 duration-200">
                                <h2 className="text-xl font-bold text-emerald-950 mb-6">Listed Users</h2>

                                {usersWithKeys.length === 0 ? (
                                    <div className="text-center py-10 border-2 border-dashed border-emerald-200 rounded-md">
                                        <p className="text-emerald-700 font-medium">No other users found.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {usersWithKeys.map(user => (
                                            <div key={user.id} className="bg-emerald-50/50 rounded-md border-2 border-emerald-100 p-5 shadow-[2px_2px_0_0_rgba(16,185,129,0.05)]">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <h3 className="text-lg font-bold text-emerald-900">{user.username}</h3>
                                                        <p className="text-sm font-medium text-emerald-600/80">Joined at {new Date(user.createdAt * 1000).toLocaleDateString()}</p>
                                                    </div>
                                                    <Form method="post" onSubmit={e => { if (!confirm("Delete user and all their keys?")) e.preventDefault() }}>
                                                        <input type="hidden" name="intent" value="delete_user" />
                                                        <input type="hidden" name="userId" value={user.id} />
                                                        <button type="submit" className="text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md text-sm font-bold transition-all border-2 border-red-200 active:translate-y-[1px] active:translate-x-[1px]">Delete User</button>
                                                    </Form>
                                                </div>
                                                <div className="pl-4 border-l-4 border-emerald-200 space-y-2">
                                                    <p className="text-xs uppercase text-emerald-600 font-bold mb-2 tracking-wider">Device Keys ({user.keys.length}/5)</p>
                                                    {user.keys.map(k => (
                                                        <div key={k.deviceKey} className="flex justify-between items-center text-sm bg-white p-2 rounded-md border-2 border-emerald-50 shadow-sm">
                                                            <code className="text-emerald-800 font-bold font-mono tracking-wider">{k.deviceKey}</code>
                                                            <Form method="post" onSubmit={e => { if (!confirm(`Delete key ${k.deviceKey} from ${user.username}?`)) e.preventDefault() }}>
                                                                <input type="hidden" name="intent" value="delete_key" />
                                                                <input type="hidden" name="deviceKey" value={k.deviceKey} />
                                                                <button type="submit" className="text-red-400 hover:text-red-600 p-1 transition-colors">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                </button>
                                                            </Form>
                                                        </div>
                                                    ))}
                                                    {user.keys.length === 0 && <span className="text-xs text-emerald-600/70 font-medium">No keys added</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        {/* Raw Devices section */}
                        {activeTab === "devices" && (
                            <section className="bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)] animate-in fade-in zoom-in-95 duration-200">
                                <h2 className="text-xl font-bold text-emerald-950 mb-6">Uncontrolled Bark Devices</h2>

                                <div className="bg-emerald-50/30 rounded-md border-2 border-emerald-100 overflow-hidden">
                                    {rawDevices.length === 0 ? (
                                        <div className="text-center py-10">
                                            <p className="text-emerald-700 font-medium">No raw devices found on this server.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y-2 divide-emerald-100">
                                            {rawDevices.map(device => (
                                                <div key={device.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-emerald-50 transition-colors">
                                                    <div className="break-all">
                                                        <code className="text-sm font-bold font-mono text-emerald-800 tracking-wider">{device.key}</code>
                                                        <div className="mt-2 flex items-center gap-2 text-xs">
                                                            {device.ownerName ? (
                                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-md border-2 border-emerald-200">
                                                                    Bound to: {device.ownerName}
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 font-bold rounded-md border-2 border-gray-200">
                                                                    Unbound
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <Form method="post" onSubmit={e => { if (!confirm(`Delete raw device ${device.key}? This will permanently remove its token and unbind it.`)) e.preventDefault() }} className="shrink-0">
                                                        <input type="hidden" name="intent" value="delete_raw_device" />
                                                        <input type="hidden" name="deviceKey" value={device.key} />
                                                        <button type="submit" className="text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md text-sm font-bold transition-all border-2 border-red-200 whitespace-nowrap active:translate-y-[1px] active:translate-x-[1px]">
                                                            Drop Device
                                                        </button>
                                                    </Form>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}
                    </div>

                    <div className="space-y-6">
                        {/* System Settings section */}
                        <section className="bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)] sticky top-8">
                            <h2 className="text-lg font-bold text-emerald-950 mb-6">Global Settings</h2>

                            <div className="space-y-4">
                                <Form method="post" className="flex items-center justify-between p-5 bg-emerald-50/50 rounded-md border-2 border-emerald-100 hover:border-emerald-300 hover:shadow-[2px_2px_0_0_rgba(16,185,129,0.05)] transition-all gap-4">
                                    <input type="hidden" name="intent" value="toggle_setting" />
                                    <input type="hidden" name="settingKey" value="allow_registration" />
                                    <input type="hidden" name="settingValue" value={allowRegistration ? "true" : "false"} />

                                    <div className="flex-1">
                                        <p className="font-bold text-emerald-900 text-sm">Allow Registration</p>
                                        <p className="text-xs font-medium text-emerald-600/80 mt-1 leading-relaxed">Whether new users can sign up to the console.</p>
                                    </div>

                                    <button type="submit" title="Toggle allow registration" className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none border-2 border-emerald-700 shadow-sm ${allowRegistration ? 'bg-emerald-500' : 'bg-gray-200 border-gray-400 hover:bg-gray-300'}`}>
                                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md border-2 border-transparent transition-transform duration-300 ${allowRegistration ? 'translate-x-6 border-emerald-600' : 'translate-x-0.5 border-gray-300'}`} />
                                    </button>
                                </Form>

                                <Form method="post" className="flex items-center justify-between p-5 bg-emerald-50/50 rounded-md border-2 border-emerald-100 hover:border-emerald-300 hover:shadow-[2px_2px_0_0_rgba(16,185,129,0.05)] transition-all gap-4">
                                    <input type="hidden" name="intent" value="toggle_setting" />
                                    <input type="hidden" name="settingKey" value="force_register_to_use" />
                                    <input type="hidden" name="settingValue" value={forceRegisterToUse ? "true" : "false"} />

                                    <div className="flex-1">
                                        <p className="font-bold text-emerald-900 text-sm">Force Registered Users</p>
                                        <p className="text-xs font-medium text-emerald-600/80 mt-1 leading-relaxed">If enabled, push events only work if key belongs to a user.</p>
                                    </div>

                                    <button type="submit" title="Toggle force registration" className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none border-2 border-emerald-700 shadow-sm ${forceRegisterToUse ? 'bg-teal-500 border-teal-700' : 'bg-gray-200 border-gray-400 hover:bg-gray-300'}`}>
                                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md border-2 border-transparent transition-transform duration-300 ${forceRegisterToUse ? 'translate-x-6 border-teal-600' : 'translate-x-0.5 border-gray-300'}`} />
                                    </button>
                                </Form>
                            </div>

                            <div className="mt-8 pt-6 border-t-2 border-dashed border-emerald-100">
                                <p className="text-xs text-emerald-600/60 text-center uppercase tracking-widest font-bold">
                                    Bark Worker Admin Console
                                </p>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
