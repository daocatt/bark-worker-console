import { redirect } from "react-router";
import { getSession } from "./session.server";
import { getDb } from "../drizzle/db.server";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export async function requireUser(request: Request, database: D1Database) {
    const session = await getSession(request.headers.get("Cookie"));
    const userId = session.get("userId");

    if (!userId) {
        throw redirect("/login");
    }

    const db = getDb(database);
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    });

    if (!user) {
        throw redirect("/login");
    }

    return user;
}

export async function requireAdmin(request: Request, database: D1Database) {
    const user = await requireUser(request, database);
    if (user.role !== "admin") {
        throw new Response("Forbidden", { status: 403 });
    }
    return user;
}

export async function getLoggedUser(request: Request, database: D1Database) {
    const session = await getSession(request.headers.get("Cookie"));
    const userId = session.get("userId");

    if (!userId) {
        return null;
    }

    const db = getDb(database);
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    });

    return user || null;
}
