# Bark Worker Console

[中文版](./README.zh.md) | English

A beautiful, modern React Router (Remix) console to manage devices and settings for the `bark-worker` Cloudflare Worker.

## Setup

⚠️ **Important**: `bark-worker-console` MUST use the **same D1 database** as `bark-worker` to seamlessly synchronize and manage `device_keys` and permission settings.

### Core Management Mechanism

- **Registration Restriction**: Controlled via the `Allow Registration` toggle in the admin panel, stored in the `settings` table.
- **Key Limit**: Each user can add up to **5** device keys, enforced by the console's backend.

1. Copy your D1 database ID from `bark-worker`:

   ```json
   "d1_databases": [
     {
       "binding": "database",
       "database_name": "database-bark",
       "database_id": "YOUR-ID-HERE"
     }
   ]
   ```

2. Paste it into this project's `wrangler.jsonc` file inside the `d1_databases` block.
3. Install dependencies: `npm install`
4. Apply migrations to initialize your database structure (adds setting and user management tables):

   ```bash
   npm run cf-typegen
   npx wrangler d1 migrations apply database-bark --local
   ```

5. Run the development server: `npm run dev`

## Deployment to Cloudflare

Deploying to Cloudflare Workers manually involves applying the schema to your remote DB and deploying your worker.

**1. Apply Database Migrations (Remote)**
First, you need to apply the schemas to your production D1 database (make sure your ID is set in `wrangler.jsonc`):

```bash
npx wrangler d1 migrations apply database-bark --remote
```

**2. Deploy to Cloudflare**
Build and deploy the React Router console to your Cloudflare account:

```bash
npm run deploy
```

> The console will be pushed as a Cloudflare Worker/Pages function and linked to your existing `bark-worker` D1 database.

## Default Admin Account

On the very first time you launch and load the application login page (`/login`), if there are no registered users in the database, the system will automatically initialize the default super administrator account:

- **Username**: `admin`
- **Password**: `admin123`

> **Note**: For security reasons, please login and use the right side "Security" panel to immediately change your default password after the first login!

## Features

- Manage your Bark device keys (up to 5 keys per account)
- System admins can disable future registrations to keep the instance private.
- System admins can enable `force_register_to_use`. When enabled, only registered users are allowed to receive APNs pushes via the `bark-worker`. Unregistered device keys will be rejected with HTTP 403.
