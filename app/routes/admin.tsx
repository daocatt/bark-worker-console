import {
    Form,
    useLoaderData,
    useActionData,
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
} from "react-router";
import { useState } from "react";
import { requireAdmin } from "../auth/auth.server";
import { getDb } from "../drizzle/db.server";
import { userDevices, users, devices } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import Nav from "../components/Nav";

export async function loader({ request, context }: LoaderFunctionArgs) {
    const admin = await requireAdmin(request, context.cloudflare.env.database as D1Database);
    const db = getDb(context.cloudflare.env.database as D1Database);

    const allUsers = await db.query.users.findMany();
    const otherUsers = allUsers.filter(u => u.id !== admin.id);

    const allUserDevices = await db.query.userDevices.findMany();

    const usersWithKeys = otherUsers.map((u) => ({
        ...u,
        keys: allUserDevices.filter((d) => d.userId === u.id),
    }));

    const allDevices = await db.query.devices.findMany();
    const rawDevices = allDevices.map(d => {
        const mapping = allUserDevices.find(ud => ud.deviceKey === d.key);
        let ownerName = null;
        if (mapping) {
            const owner = allUsers.find(u => u.id === mapping.userId);
            ownerName = owner?.username || "Unknown";
        }
        return { ...d, ownerName };
    });

    return { admin, usersWithKeys, rawDevices };
}

export async function action({ request, context }: ActionFunctionArgs) {
    await requireAdmin(request, context.cloudflare.env.database as D1Database);
    const db = getDb(context.cloudflare.env.database as D1Database);
    const formData = await request.formData();
    const intent = formData.get("intent")?.toString();

    switch (intent) {
        case "delete_user": {
            const userId = Number(formData.get("userId"));
            if (!userId) return { error: "Missing user ID" };
            await db.delete(users).where(eq(users.id, userId));
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
            await db.delete(userDevices).where(eq(userDevices.deviceKey, deviceKey));
            return { success: "Raw device removed" };
        }
    }
    return null;
}

export default function Admin() {
    const { admin, usersWithKeys, rawDevices } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const [activeTab, setActiveTab] = useState<"users" | "devices">("users");

    return (
        <div className="p-4 sm:p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                <Nav user={admin} />

                {actionData && (
                    <div className={`p-4 rounded-md border-2 mb-6 ${actionData.error ? 'bg-red-50 border-red-200 text-red-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700 font-medium'}`}>
                        {actionData.error || actionData.success}
                    </div>
                )}

                <div className="space-y-6">
                    <div className="bg-white border-2 border-emerald-200 rounded-lg p-2 flex items-center space-x-2 shadow-[2px_2px_0_0_rgba(16,185,129,0.1)] max-w-md">
                        <button
                            onClick={() => setActiveTab("users")}
                            className={`flex-1 flex justify-center items-center py-2.5 text-sm font-bold rounded-md transition-all ${activeTab === "users" ? "bg-emerald-500 text-white shadow-[2px_2px_0_0_rgba(4,120,87,1)] border-2 border-emerald-700" : "text-emerald-700 hover:bg-emerald-50 border-2 border-transparent"}`}
                        >
                            Users Management
                        </button>
                        <button
                            onClick={() => setActiveTab("devices")}
                            className={`flex-1 flex justify-center items-center py-2.5 text-sm font-bold rounded-md transition-all ${activeTab === "devices" ? "bg-emerald-500 text-white shadow-[2px_2px_0_0_rgba(4,120,87,1)] border-2 border-emerald-700" : "text-emerald-700 hover:bg-emerald-50 border-2 border-transparent"}`}
                        >
                            Global Devices
                        </button>
                    </div>

                    {activeTab === "users" ? (
                        <section className="bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)] animate-in fade-in zoom-in-95 duration-200">
                            <h2 className="text-xl font-bold text-emerald-950 mb-6">Listed Users</h2>
                            {usersWithKeys.length === 0 ? (
                                <p className="text-emerald-700 font-medium">No other users found.</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {usersWithKeys.map(user => (
                                        <div key={user.id} className="bg-emerald-50/50 rounded-md border-2 border-emerald-100 p-5">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="text-lg font-bold text-emerald-900">{user.username}</h3>
                                                    <p className="text-xs text-emerald-600/70">ID: {user.id}</p>
                                                </div>
                                                <Form method="post" onSubmit={e => { if (!confirm("Delete user?")) e.preventDefault() }}>
                                                    <input type="hidden" name="intent" value="delete_user" />
                                                    <input type="hidden" name="userId" value={user.id} />
                                                    <button type="submit" className="text-red-500 hover:text-red-700 font-bold text-xs uppercase">Delete User</button>
                                                </Form>
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-xs font-bold text-emerald-700 uppercase tracking-tighter">Device Keys ({user.keys.length}/5)</p>
                                                {user.keys.map(k => (
                                                    <div key={k.deviceKey} className="flex justify-between items-center text-xs bg-white p-2 rounded-md border-2 border-emerald-50">
                                                        <code className="font-mono">{k.deviceKey}</code>
                                                        <Form method="post">
                                                            <input type="hidden" name="intent" value="delete_key" />
                                                            <input type="hidden" name="deviceKey" value={k.deviceKey} />
                                                            <button type="submit" className="text-red-400 font-bold">✕</button>
                                                        </Form>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    ) : (
                        <section className="bg-white p-6 rounded-lg border-2 border-emerald-200 shadow-[4px_4px_0_0_rgba(16,185,129,0.15)] animate-in fade-in zoom-in-95 duration-200">
                             <h2 className="text-xl font-bold text-emerald-950 mb-6">Uncontrolled Bark Devices</h2>
                             <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="text-xs uppercase text-emerald-700 font-bold bg-emerald-50 border-b-2 border-emerald-100">
                                        <tr>
                                            <th className="px-4 py-3">Device Key</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-emerald-50">
                                        {rawDevices.map(device => (
                                            <tr key={device.id} className="hover:bg-emerald-50/30 transition-colors">
                                                <td className="px-4 py-3 font-mono text-xs">{device.key}</td>
                                                <td className="px-4 py-3">
                                                    {device.ownerName ? (
                                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded">Bound: {device.ownerName}</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-bold rounded">Unbound</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <Form method="post" onSubmit={e => { if (!confirm(`Delete device?`)) e.preventDefault() }}>
                                                        <input type="hidden" name="intent" value="delete_raw_device" />
                                                        <input type="hidden" name="deviceKey" value={device.key} />
                                                        <button type="submit" className="text-red-500 hover:text-red-700 font-bold text-xs uppercase">Drop</button>
                                                    </Form>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                             </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
