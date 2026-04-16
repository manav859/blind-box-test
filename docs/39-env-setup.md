# Env Setup

Date: 2026-04-13

## Purpose

This document explains exactly how backend environment variables are loaded in the current SHOPLINE Blind Box repo.

It is grounded in the current backend code only.

It does not change feature behavior.

## How Backend Env Loading Works

The backend loads env in two places:

- `app/src/shopline.ts`
- `app/src/lib/config.ts`

Both import:

```ts
import "dotenv/config";
```

That means the backend uses the default `dotenv` behavior for the current process working directory.

In this repo, the backend normally runs from the `app` workspace:

- root `npm run dev` runs `shopline app dev`
- the SHOPLINE CLI uses `app/shopline.web.toml`
- that file runs `npm run dev` inside `app`
- `app/package.json` starts the backend process there

So for normal local backend development, the env file should live at:

- `app/.env`

## Current Config Sources

The backend currently reads config from these sources:

### 1. `app/.env`

This is the normal dotenv-backed source for local backend values.

Use this for:

- `SHOPLINE_APP_SECRET`
- blind-box runtime env
- optional local overrides

### 2. Shell Environment

Any variable already exported in the shell is visible to the backend process.

This also includes values injected by the SHOPLINE CLI runtime during `npm run dev`.

Important example:

- `BACKEND_PORT`

### 3. SHOPLINE App TOML Files

The backend has an explicit fallback in:

- `app/src/lib/shopline-app-config.ts`

That fallback reads the first available SHOPLINE app TOML set from the current working directory or its parent:

- `shopline.app.toml`
- `shopline.app.<linked-name>.toml`

The resolver merges those TOMLs for:

- `appKey`
- `appSecret`
- `appUrl`
- `scopes`

So these backend env vars can currently fall back to TOML if unset:

- `SHOPLINE_APP_KEY`
- `SHOPLINE_APP_SECRET`
- `SHOPLINE_APP_URL`
- `SCOPES`

### 4. `app/.env` vs root `.env`

The backend does **not** currently have repo code that explicitly loads a root `.env`.

For the normal backend workflow in this repo, do **not** rely on a root `.env`.

Create:

- `app/.env`

## Exact Backend Env Variable Names Currently Used

These are the current backend env names read by code under `app/src`.

### SHOPLINE App Bootstrap

- `SHOPLINE_APP_KEY`
- `SHOPLINE_APP_SECRET`
- `SHOPLINE_APP_URL`
- `SCOPES`

### Blind-Box And Backend Runtime

- `BLIND_BOX_DATABASE_PATH`
- `BLIND_BOX_DATABASE_BUSY_TIMEOUT_MS`
- `BLIND_BOX_INVENTORY_EXECUTION_MODE`
- `SHOPLINE_ADMIN_API_VERSION`
- `BLIND_BOX_SHOPLINE_LOCATION_ID`
- `LOG_LEVEL`

### Backend Server Runtime

- `BACKEND_PORT`
- `PORT`
- `NODE_ENV`

## Which Variables Are Required Now

### Required To Start The Embedded Backend

- `SHOPLINE_APP_SECRET`
  - required logically
  - can currently come from env or from SHOPLINE app TOML fallback

- `SHOPLINE_APP_KEY`
  - required logically
  - can currently come from env or from SHOPLINE app TOML fallback

- `SHOPLINE_APP_URL`
  - required logically
  - can currently come from env or from SHOPLINE app TOML fallback

- `SCOPES`
  - required logically for correct auth/session scope validation
  - can currently come from env or from SHOPLINE app TOML fallback

- `BACKEND_PORT` or `PORT`
  - required to bind the Express server
  - normally injected by the SHOPLINE CLI when you run root `npm run dev`
  - if you run `app/npm run dev` directly, the backend now defaults to `3001` when neither value is present

### Required Now For Blind-Box Local Development

- `BLIND_BOX_INVENTORY_EXECUTION_MODE`
  - optional because it defaults to `deferred`
  - set to `execute` only when you are intentionally validating live inventory execution

- `BLIND_BOX_SHOPLINE_LOCATION_ID`
  - optional in code because it defaults to `null`
  - effectively required for reliable execute-mode store validation, especially in a multi-location store

### Optional Runtime Overrides

- `BLIND_BOX_DATABASE_PATH`
- `BLIND_BOX_DATABASE_BUSY_TIMEOUT_MS`
- `SHOPLINE_ADMIN_API_VERSION`
- `LOG_LEVEL`

## Recommended Env File Location

Create this file:

- `app/.env`

That is the correct place for current backend local development in this repo.

## Sample Env Block For Current Local Development

Put this in:

- `app/.env`

```dotenv
# Required for backend startup
SHOPLINE_APP_SECRET=your-real-private-app-secret

# Optional explicit copies of values that can also fall back from root shopline.app.toml
SHOPLINE_APP_KEY=0758d90091e6e9adcd5b810cbe568d9b6e60e174
SHOPLINE_APP_URL=https://shops-journals-toolbox-diverse.trycloudflare.com
SCOPES=write_products,read_products,read_inventory,read_location,write_inventory

# Blind-box runtime
BLIND_BOX_INVENTORY_EXECUTION_MODE=execute
BLIND_BOX_SHOPLINE_LOCATION_ID=123456789
SHOPLINE_ADMIN_API_VERSION=v20230901
LOG_LEVEL=info

# Optional backend/runtime overrides
# BLIND_BOX_DATABASE_PATH=./blind-box-domain.sqlite
# BLIND_BOX_DATABASE_BUSY_TIMEOUT_MS=5000

# Only needed if you run app/npm run dev directly instead of root npm run dev
# PORT=3001
```

If you are not testing live inventory execution yet, use:

```dotenv
BLIND_BOX_INVENTORY_EXECUTION_MODE=deferred
```

## Practical Local Setup Guidance

### Normal Workflow

Use:

```powershell
cd C:\Users\manav\blindbox-test-01
npm run dev
```

For that workflow:

- put local backend env in `app/.env`
- let the SHOPLINE CLI provide `BACKEND_PORT`

### Standalone Backend Workflow

If you run:

```powershell
cd C:\Users\manav\blindbox-test-01\app
npm run dev
```

then the backend defaults to:

- `PORT=3001`

unless you explicitly provide `PORT` or `BACKEND_PORT`, plus any blind-box values you want locally.

## Summary

For this repo today:

- backend dotenv values belong in `app/.env`
- shell env is also supported
- SHOPLINE app TOML files currently provide fallback for:
  - `SHOPLINE_APP_KEY`
  - `SHOPLINE_APP_SECRET`
  - `SHOPLINE_APP_URL`
  - `SCOPES`
- `BLIND_BOX_SHOPLINE_LOCATION_ID` should be placed in `app/.env` for normal local development
