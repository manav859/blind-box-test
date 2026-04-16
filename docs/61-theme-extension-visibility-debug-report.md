# Theme Extension Visibility Debug Report

Date: 2026-04-14

## Root Cause Summary

The single most likely blocker is that the current Blind Box setup is still being treated as a private/custom app workflow, and SHOPLINE does not support theme app extension app blocks or app embed blocks for custom/private apps on Online Store 2.0 or 2.1 themes.

There is also a confirmed store-linkage risk: the only installed offline session present locally is for store handle `test-store-mnv`, so if Theme Editor is open in any other store, the Apps tab will show no components for this app.

## Checks Performed

### 1. Active Extension Project

Verified the active extension folder is:

- `extensions/theme-app-extension`

This matches the live CLI push target and remote extension identity:

- extension name: `theme-app-extension`
- extension UUID: `b8cc4281-97ca-4fd2-ab29-aec857237170`
- extension ID: `8424`

This does **not** match older internal docs that still reference:

- `extensions/blind-box-theme`

Those older docs are stale and should not be used as the source of truth for current push/version/publish work.

### 2. Extension Structure

The current extension root that the CLI successfully pushed contains:

- `assets/`
- `blocks/`
- `locales/`
- `.shopline-cli.yml`
- `.env`
- `.env.prod`

The current active structure is the older SHOPLINE theme app extension layout validated by the installed CLI.

Important:

- I previously tested the OS 3.0-style root layout (`public/`, `i18n/`, `components/`).
- the current CLI rejected that layout with `Invalid directory: i18n`
- those experimental folders were moved out of the active extension root to:
  - `extensions/theme-app-extension-layout-backup`

### 3. Block Schema And Compatibility

Audited:

- `extensions/theme-app-extension/blocks/blind-box-product-shell.html`

Current high-confidence status:

- block exists under `blocks/`
- `target` is `section`
- `templates` is `["products/detail"]`
- `stylesheet` is `["blind-box-product-shell.css"]`
- unsupported `tag` field has been removed
- current schema now pushes successfully with the installed SHOPLINE CLI

Why `products/detail` is correct here:

- the active CLI validator explicitly rejected `product`
- it accepted `products/detail`
- this confirms the current extension is being validated against the older SHOPLINE theme app extension schema/version

Settings audit:

- setting types used are `checkbox`, `text`, `textarea`, and `select`
- those are valid SHOPLINE input-setting types
- schema i18n references such as `t:blind_box_product_shell.settings.show_badge.label` are backed by keys in `locales/en.schema.json`

What is **not** blocking visibility:

- storefront strings inside the markup are still mostly hardcoded English, but that affects localization quality, not whether the block appears in Theme Editor

### 4. App Key And Extension Linkage

The app key is consistent across the relevant files:

- `shopline.app.toml`
- `shopline.app.blindbox-test-01.toml`
- `extensions/theme-app-extension/.env`
- `extensions/theme-app-extension/.env.prod`
- root `.env`

Current shared app key:

- `0758d90091e6e9adcd5b810cbe568d9b6e60e174`

The extension is correctly linked to the same app key that the backend uses through `app/src/shopline.ts` and `app/src/lib/shopline-app-config.ts`.

### 5. App Install And Store Handle Audit

Checked local session storage in:

- `app/database.sqlite`

Current installed offline session found locally:

- `offline_test-store-mnv`

Resolved store handle:

- `test-store-mnv`

Implication:

- if Theme Editor is open in `test-store-mnv`, store linkage is plausible
- if Theme Editor is open in any other store, the app is not currently installed there according to local session evidence

### 6. Theme Compatibility Audit

The current block only targets:

- `products/detail`

So the correct Theme Editor location for this block is:

- a product detail template

This block is not expected to appear when editing:

- home page
- cart
- blog list
- customer pages
- any non-product template

Section compatibility rule:

- the theme section you are editing must support app blocks
- if the Apps tab is empty everywhere in Theme Editor, the problem is not just the current section
- if the app appears in some sections but not others, use a product-detail section that supports app blocks

### 7. Publish And Version State

Confirmed local push success after the schema cleanup:

- pushed draft timestamp: `2026-04-14 22:21:23`

Developer Center link printed by CLI:

- `https://developer.myshopline.com/app/edit-extension/0758d90091e6e9adcd5b810cbe568d9b6e60e174/b8cc4281-97ca-4fd2-ab29-aec857237170`

Important implication:

- any version published **before** the `2026-04-14 22:21:23` push does **not** include the latest local schema fix
- you must create a new version from this latest draft and publish it

I could not directly inspect the authenticated Developer Center version history from the local workspace, so remote publish state still requires a manual check in the SHOPLINE UI.

### 8. Config Consistency Audit

#### Consistent

- `SHOPLINE_APP_KEY`
- `SHOPLINE_APP_SECRET`
- extension UUID / extension ID in the extension env files

#### Inconsistent

There are multiple conflicting app URLs in local config:

- root `.env`
  - `https://cut-logs-law-par.trycloudflare.com`
- `extensions/theme-app-extension/.env`
  - `https://cut-logs-law-par.trycloudflare.com`
- `shopline.app.toml`
  - `https://install-afterwards-seeds-dictionary.trycloudflare.com`
- `shopline.app.blindbox-test-01.toml`
  - `https://redeem-roster-apartment-bags.trycloudflare.com`

Why this matters:

- install/auth URLs can point to the wrong tunnel
- the wrong app URL can send you through a stale OAuth callback URL
- this creates confusion about which app instance/store install is actually active

What is the source of truth right now:

- for the backend fallback path, `app/src/lib/shopline-app-config.ts` prefers runtime env first and then falls back to the SHOPLINE TOML files
- in normal repo-root `npm run dev` usage, the active linked TOML file is the best local source of truth
- use `shopline.app.blindbox-test-01.toml` after `npm run dev:reset`

## High-Confidence Findings

### Finding 1

The repo is still documented and operated as a private app/store workflow in multiple local docs.

Examples:

- `docs/35-private-app-scope-and-config-checklist.md`
- `docs/34-live-store-inventory-validation.md`
- `docs/32-inventory-integration-and-recovery.md`

This matters because SHOPLINE officially documents that for Online Store 2.0 and 2.1:

- public apps: app blocks supported
- custom apps: app blocks not supported
- private apps: app blocks not supported

If the current Blind Box app is still a custom/private app in Developer Center, that alone explains the empty Apps tab.

### Finding 2

The active extension now pushes cleanly on the current CLI, so the local extension package is no longer the primary suspect.

### Finding 3

The only store locally proven to have an installed offline session is:

- `test-store-mnv`

If Theme Editor is open in a different store, the app block will not appear there.

### Finding 4

The current published extension version may be stale relative to the latest pushed draft, because the successful push happened after the latest local schema fix.

### Finding 5

The current app config has multiple competing tunnel URLs, so reinstall/auth work must use the active linked TOML URL, not whichever URL happens to be in an old `.env` file.

## Exact Fix Steps

### Fix Path A: If The App Is A Custom Or Private App In Developer Center

This is the highest-confidence product-level blocker.

Do this:

1. In SHOPLINE Developer Center, open the app record for `blindbox-test-01`.
2. Check the app type.
3. If it is `Custom app` or `Private app`, stop expecting theme app blocks to appear in Theme Editor for this app on Online Store 2.0 or 2.1.
4. Create or migrate to a `Public app` version of the app for theme app extension support.
5. Re-link the theme app extension to that public app, push again, create a new version, and publish it.

### Fix Path B: If The App Is Already A Public App

Then the next highest-confidence issue is store/install/version mismatch.

Do this:

1. Reset the active CLI app/store linkage:

```powershell
cd C:\Users\manav\blindbox-test-01
npm run dev:reset
```

2. In the CLI prompts, choose:

- Org: `mnv`
- App: `blindbox-test-01`
- Store: `test-store-mnv` if that is the store where you will open Theme Editor

3. Reinstall or reauthorize against that same store:

```powershell
cd C:\Users\manav\blindbox-test-01
$store = "test-store-mnv"
$appUrl = "https://redeem-roster-apartment-bags.trycloudflare.com"
Start-Process "$appUrl/api/auth?handle=$store"
```

4. Re-push the extension draft:

```powershell
cd C:\Users\manav\blindbox-test-01\extensions\theme-app-extension
shopline extension push
```

5. Open the printed Developer Center link, create a new version, and publish it.

6. Open Theme Editor in the **same store** and test on a **product detail template**.

### Fix Path C: If You Are Editing An Online Store 3.0 Theme

Do not assume the current extension package is ready for OS 3.0 just because it pushes on the current CLI.

Current local evidence shows:

- current CLI package in the workspace is `@shoplinedev/cli` `2.1.5`
- the active extension validates in the older `assets/blocks/locales` format
- the current CLI rejected the OS 3.0 root layout (`i18n`)

If the target theme is Online Store 3.0, you likely need to:

1. Upgrade to the newer SHOPLINE CLI/tooling that supports OS 3.0 theme app extension migration.
2. Add `compatibility: true` to `.shopline-cli.yml`.
3. Use the OS 3.0 root layout:
   - `blocks/`
   - `components/`
   - `i18n/`
   - `public/`
4. Move the current OS 2.1 assets into a `compatibility/` subdirectory.

Do **not** perform this migration blindly until you confirm the target theme is actually OS 3.0, because the currently installed CLI is still validating the older format.

## Copy-Paste Terminal Commands

### 1. Confirm the active extension folder

```powershell
cd C:\Users\manav\blindbox-test-01
Get-ChildItem .\extensions
```

### 2. Push the extension draft

```powershell
cd C:\Users\manav\blindbox-test-01\extensions\theme-app-extension
shopline extension push
```

### 3. Reset app/store linkage

```powershell
cd C:\Users\manav\blindbox-test-01
npm run dev:reset
```

### 4. Reauthorize the app in the target store

```powershell
cd C:\Users\manav\blindbox-test-01
$store = "test-store-mnv"
$appUrl = "https://redeem-roster-apartment-bags.trycloudflare.com"
Start-Process "$appUrl/api/auth?handle=$store"
```

### 5. Check the locally installed store handle

```powershell
cd C:\Users\manav\blindbox-test-01\app
@'
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.sqlite');
db.all("SELECT id, handle, scope, expires FROM shopline_sessions ORDER BY id", (err, rows) => {
  if (err) { console.error(err); process.exit(1); }
  rows.forEach((row, index) => {
    console.log(`${index + 1}: ${JSON.stringify(row)}`);
  });
  db.close();
});
'@ | node -
```

## Exact SHOPLINE UI Steps

### Developer Center

1. Open `developer.myshopline.com`.
2. Go to `Apps`.
3. Open `blindbox-test-01`.
4. Open `App extensions`.
5. Open `theme-app-extension`.
6. Confirm the draft updated after `2026-04-14 22:21:23`.
7. Click `Create a version`.
8. Choose the version type.
9. Click `Add`.
10. Click `Publish`.
11. Confirm publish.

### Store Admin / App Install

1. Open the store admin for `test-store-mnv`.
2. Open the embedded app install/auth URL produced by the active app tunnel.
3. Complete install or reauthorization.
4. Open the embedded app once to ensure the offline session is refreshed.

### Theme Editor

1. Open the same store admin where the app is installed.
2. Go to `Online Store`.
3. Open the target theme.
4. Click `Customize`.
5. Switch to a `product detail` template.
6. Select a section that supports app blocks.
7. Click `Add component`.
8. Open the `Apps` tab.
9. Look for `Blind Box product shell`.
10. Insert the block and save.

## Final Verification Checklist

- the app in Developer Center is confirmed to be a `Public app`, or you have explicitly accepted that custom/private apps are unsupported for app blocks on OS 2.0/2.1
- the extension draft was pushed successfully after the latest local schema fix
- a new version was created from that latest draft
- that new version was published
- the app is installed in the same store where Theme Editor is opened
- the store handle in local session storage matches the store being tested
- Theme Editor is opened on a `product detail` template
- the chosen section supports app blocks
- the `Apps` tab shows `Blind Box product shell`
- after insertion, `blind-box-product-shell.css` loads on the page

## References

- SHOPLINE get started: `https://developer.shopline.com/docs/themes-2-0/integrate-apps-with-themes/theme-app-extension/getting-started/`
- SHOPLINE theme integration overview and compatibility matrix: `https://developer.shopline.com/docs/themes-2-0/integrate-apps-with-themes/overview/?version=v20231201`
- SHOPLINE theme app extension framework: `https://developer.shopline.com/docs/themes-2-0/integrate-apps-with-themes/theme-app-extension/framework/?lang=en`
- SHOPLINE input settings: `https://developer.shopline.com/docs/themes-2-0/architecture/settings/input-settings/`
- SHOPLINE sections overview: `https://developer.shopline.com/docs/themes-2-0/architecture/sections/overview/`
- SHOPLINE OS 2.1 to OS 3.0 migration guide: `https://developer.shopline.com/zh-hans-cn/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/migration-guide-from-os-2-1-to-os-3-0?version=v20240301`
