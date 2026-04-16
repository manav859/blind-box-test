# OS 3.0 Theme Migration Test Plan

Date: 2026-04-14

## Goal

Use the strongest remaining storefront-side test path to determine whether the current empty `Apps` tab is caused by:

- the current store theme not being a valid Online Store 3.0 test target
- the theme app extension not yet being migrated to the Online Store 3.0 format
- the app type still being the real blocker, which would mean moving to a public app is the correct next step

This document is planning only. It does not change backend blind-box logic and does not start reveal/result work.

## Current Extension Readiness

The current active extension is not yet structurally ready for an OS 3.0-native theme test.

Verified current state:

- active extension root is `extensions/theme-app-extension`
- active folders are:
  - `assets/`
  - `blocks/`
  - `locales/`
- `.shopline-cli.yml` does not contain `compatibility: true`
- the app block file uses Handlebars, for example:
  - `{{#if ...}}`
  - `{{ block.settings.title }}`
- the current local CLI is `@shoplinedev/cli` `2.1.5`

Per SHOPLINE's OS 2.1 to OS 3.0 migration guide:

- OS 2.1 directories:
  - `assets`
  - `locales`
  - `snippets`
- OS 3.0 directories:
  - `public`
  - `i18n`
  - `components`
- syntax changes from:
  - `Handlebars`
  - to `Sline`
- migration requires:
  - `compatibility: true` in `.shopline-cli.yml`
  - a root `compatibility/` directory that holds the OS 2.1 assets
  - the newer SHOPLINE CLI

Conclusion:

- a positive result on a clean OS 3.0 theme would prove the current merchant theme was the blocker
- a negative result on a clean OS 3.0 theme is not yet conclusive until the extension is minimally migrated to the OS 3.0-compatible structure

## What Counts As A Proper OS 3.0 Theme Test Target

A proper OS 3.0 theme target should satisfy at least one of these:

1. A fresh Bottle-based theme created with the OS 3.0 theme CLI workflow.
2. A merchant theme pulled locally whose `theme.schema.json` contains:
   - `"theme_type_version": "OS_3.0"`
3. A theme codebase with the standard OS 3.0 root structure:
   - `blocks/`
   - `components/`
   - `i18n/`
   - `layout/`
   - `public/`
   - `sections/`
   - `templates/`
   - `theme.config.json`
   - `theme.schema.json`

If the pulled theme still looks like the older `assets/locales/snippets` stack, it is not the target we want for this test.

## Phase 1: Identify Whether The Current Store Theme Is OS 2.1 Or OS 3.0

### Code-Level Check

This is the most reliable check.

1. Install the current SHOPLINE OS 3.0 CLI globally:

```powershell
npm install --global @shoplineos/cli
sl --version
```

2. Log in to the target store:

```powershell
sl login --store=your-store.myshopline.com
```

3. Pull the theme to an empty folder:

```powershell
mkdir C:\Users\manav\os3-theme-audit
cd C:\Users\manav\os3-theme-audit
shopline theme pull
```

If you already know the theme ID, you can use:

```powershell
sl theme pull --theme <THEME_ID>
```

4. Inspect the pulled theme root:

```powershell
Get-ChildItem
Get-Content .\theme.schema.json
```

### What To Look For

This theme is OS 3.0-compatible if:

- `theme.schema.json` contains `"theme_type_version": "OS_3.0"`
- the root uses `components`, `i18n`, and `public`

This theme is still OS 2.1-style if:

- `theme.schema.json` is missing the OS 3.0 marker
- the root still uses `assets`, `locales`, and `snippets`

### SHOPLINE Admin Path

If you prefer not to pull first:

1. Open the store admin.
2. Go to `Online Store -> Design`.
3. Find the active theme.
4. Click `Options -> Download code`.
5. Download and unzip the theme locally.
6. Open `theme.schema.json` and inspect the root directories.

## Phase 2: Create Or Obtain A Clean OS 3.0 Test Theme

Use one of these paths.

### Path A: Create A Fresh Bottle-Based OS 3.0 Test Theme

This is the cleanest compatibility test.

```powershell
mkdir C:\Users\manav\blindbox-os3-theme-test
cd C:\Users\manav\blindbox-os3-theme-test
sl theme init blindbox-os3-theme-test
cd .\blindbox-os3-theme-test
sl theme serve
```

The terminal should provide:

- local preview URL
- online preview URL
- theme editor URL

If you want to upload it to the store theme library:

```powershell
sl theme package
sl theme push
```

### Path B: Pull An Existing Merchant OS 3.0 Theme

Use this if the store already has a theme you believe is OS 3.0.

```powershell
mkdir C:\Users\manav\blindbox-existing-os3-theme
cd C:\Users\manav\blindbox-existing-os3-theme
shopline theme pull
sl theme serve
```

Only continue if the pulled code confirms `OS_3.0`.

## Phase 3: Run The Theme-Only Smoke Test

This test is intentionally minimal and does not migrate the extension yet.

### Preconditions

- the app is installed in the same store used for the test
- the extension draft has already been pushed, versioned, and published
- the test theme is confirmed OS 3.0-compatible

### Theme Editor Test Steps

1. Open the test store admin.
2. Go to `Online Store -> Design`.
3. Open the OS 3.0 test theme.
4. Click `Design` or open the theme editor from the CLI `sl theme serve` output.
5. Switch to a product-detail template.
6. Select a section that supports blocks.
7. Click `Add component`.
8. Open the `Apps` tab.
9. Look for `Blind Box product shell`.

### What A Positive Result Means

If the block appears on the clean OS 3.0 test theme:

- the current merchant theme was the blocker
- you should stop debugging app type first
- the next step is to migrate or replace the merchant theme with an OS 3.0-compatible theme path

### What A Negative Result Means

If the block still does not appear:

- do not conclude immediately that the app type is the blocker
- the current extension is still OS 2.1-style, so the negative result is not yet clean
- move to Phase 4

## Phase 4: Minimal OS 3.0 Extension Migration Plan

This is the smallest migration needed to make the OS 3.0 storefront-side test meaningful.

Do this in a dedicated branch or throwaway test copy of the extension.

### 1. Install The Newer OS 3.0 CLI

```powershell
npm install --global @shoplineos/cli
sl --version
```

### 2. Update The Extension Config

Add this to `.shopline-cli.yml`:

```yaml
---
compatibility: true
project_type: extension
organization_id: 0
EXTENSION_TYPE: THEME_APP_EXTENSION
```

### 3. Restructure The Extension Root

Target root structure:

```text
theme-app-extension
|-- blocks
|-- components
|-- i18n
|-- public
|-- compatibility
|   |-- assets
|   |-- blocks
|   |-- locales
|   `-- snippets
`-- .shopline-cli.yml
```

### 4. Syntax Migration

Convert the OS 2.1 Handlebars app block to OS 3.0 Sline syntax.

At minimum this means:

- replace Handlebars conditionals with Sline equivalents
- move OS 2.1 static references to `public`
- keep merchant-facing translation keys in `i18n/*.schema.json`

### 5. Push, Version, Publish Again

```powershell
cd C:\Users\manav\blindbox-test-01\extensions\theme-app-extension
sl extension push
```

Then in Partner Portal:

1. Open the printed link.
2. Create a new version from the latest draft.
3. Publish it.

### 6. Re-Test On The Clean OS 3.0 Theme

Repeat the Theme Editor test in Phase 3.

## Decision Rules

### Theme Is The Blocker If

Any of these happen:

- the current store theme pulls down as OS 2.1-style
- a fresh OS 3.0 Bottle/custom theme shows the app block in Theme Editor
- the app block appears only on the clean OS 3.0 theme and not on the current merchant theme

### Move To Public App Now If

This is the clean cutoff:

- the test theme is confirmed OS 3.0
- the extension has been minimally migrated to the OS 3.0-compatible structure
- the migrated extension is pushed, versioned, and published again
- the app is installed in the same test store
- Theme Editor still shows `0 components` in `Add component -> Apps`

At that point, theme compatibility is no longer the best explanation. Switch to a public app path.

## Recommended Manual Test Order

1. Confirm the current merchant theme version by pulling or downloading it.
2. Create a fresh Bottle-based OS 3.0 test theme.
3. Run the theme-only smoke test on that theme.
4. If still empty, do the minimal OS 3.0 extension migration in a test branch.
5. Re-push, re-version, re-publish, and re-test on the clean OS 3.0 theme.
6. If still empty, stop theme debugging and switch to the public app path.

## Official References

- OS 3.0 theme app extension get started: https://developer.shopline.com/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/get-started/?version=v20251201
- OS 3.0 theme app extension structure: https://developer.shopline.com/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/structure/?version=v20231201
- OS 2.1 to OS 3.0 extension migration guide: https://developer.shopline.com/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/migration-guide-from-os-2-1-to-os-3-0/?version=v20251201
- Build a custom OS 3.0 theme: https://developer.shopline.com/docs/online-store-3-0-themes/get-started/build-a-custom-theme/?version=v20260301
- OS 3.0 theme structure overview: https://developer.shopline.com/docs/online-store-3-0-themes/theme-structure/overview/?version=v20251201
- OS 3.0 theme.schema.json: https://developer.shopline.com/docs/online-store-3-0-themes/theme-structure/theme-schema-json/
