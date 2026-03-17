# Bark Worker 管理控制台

一个美观、现代的 React Router (Remix) 控制台，用于管理 `bark-worker` Cloudflare Worker 的设备和设置。

## 安装指南

⚠️ **重要提示**：`bark-worker-console` **必须**与 `bark-worker` 使用**同一个 D1 数据库**，以便能够无缝同步和管理 `device_keys` 及权限配置。

### 核心管理机制

- **限制注册**：通过管理员面板中的 `Allow Registration` 开关控制，设置存储于数据库的 `settings` 表中。
- **限制数量**：每个用户最多可添加 **5** 个设备 Key，由控制台后端在添加操作时强制校验。

1. 从 `bark-worker` 项目中复制你的 D1 数据库 ID：

   ```json
   "d1_databases": [
     {
       "binding": "database",
       "database_name": "database-bark",
       "database_id": "在此处替换你的-ID"
     }
   ]
   ```

2. 将其粘贴到本项目 `wrangler.jsonc` 文件的 `d1_databases` 区块中。
3. 安装依赖：`npm install`
4. 执行迁移以初始化数据库结构（添加设置和用户管理相关的表）：

   ```bash
   npm run cf-typegen
   npx wrangler d1 migrations apply database-bark --local
   ```

5. 启动开发服务器：`npm run dev`

## 部署到 Cloudflare

手动部署到 Cloudflare Workers 包括将架构应用到远程数据库并部署 Worker。

**1. 应用数据库迁移（远程）**
首先，你需要将架构应用到生产环境的 D1 数据库（确保 `wrangler.jsonc` 中的 ID 已填对）：

```bash
npx wrangler d1 migrations apply database-bark --remote
```

**2. 部署到 Cloudflare**
构建并将 React Router 控制台部署到你的 Cloudflare 账户：

```bash
npm run deploy
```

> 控制台将作为 Cloudflare Worker/Pages 函数发布，并连接到你现有的 `bark-worker` D1 数据库。

## 默认管理员账号

当你第一次启动并加载登录页面 (`/login`) 时，如果数据库中没有已注册的用户，系统将自动初始化默认的超级管理员账户：

- **用户名**: `admin`
- **密码**: `admin123`

> **注意**：出于安全考虑，请在首次登录后立即使用右侧的“安全 (Security)”面板修改默认密码！

## 功能特性

- 管理你的 Bark 设备 Key（每个账号上限 5 个）
- 系统管理员可以禁用后续注册，以保持实例的限制性。
- 系统管理员可以启用 `force_register_to_use`。启用后，只有注册用户才允许通过 `bark-worker` 接收 APNs 推送。未注册的设备 Key 将被拦截并返回 HTTP 403 错误。
