import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("login", "routes/login.tsx"),
    route("register", "routes/register.tsx"),
    route("admin", "routes/admin.tsx"),
    route("admin/settings", "routes/admin-settings.tsx"),
    route("security", "routes/security.tsx"),
    route("logout", "routes/logout.ts"),
] satisfies RouteConfig;
