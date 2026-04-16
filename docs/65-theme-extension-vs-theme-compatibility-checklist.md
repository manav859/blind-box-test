# Theme Extension Vs Theme Compatibility Checklist

Date: 2026-04-14

## Purpose

Use this checklist to separate:

- current theme incompatibility
- OS 3.0 extension migration gaps
- app-type limitations

This is a decision checklist for testing only.

## A. Current Theme Compatibility Check

### Admin Check

- Open `Online Store -> Design`.
- Identify the exact theme you are editing in Theme Editor.
- If possible, download its code from `Options -> Download code`.

### Local Code Check

- Pull or unzip the theme locally.
- Confirm `theme.schema.json` exists.
- Confirm whether `theme.schema.json` contains:
  - `"theme_type_version": "OS_3.0"`
- Confirm whether the theme root contains:
  - `components/`
  - `i18n/`
  - `public/`
  - `layout/`
  - `sections/`
  - `templates/`
  - `theme.config.json`
  - `theme.schema.json`

### Read The Result

- If the theme is missing `OS_3.0`, it is not the right compatibility target.
- If the theme still looks like `assets/locales/snippets`, treat it as OS 2.1-style.

## B. Current Extension Compatibility Check

### Active Extension Root

- Confirm the active extension folder is `extensions/theme-app-extension`.
- Confirm `.shopline-cli.yml` exists.

### OS 3.0 Readiness Markers

The extension is OS 3.0-ready only if all of these are true:

- `.shopline-cli.yml` contains `compatibility: true`
- root contains:
  - `blocks/`
  - `components/`
  - `i18n/`
  - `public/`
- old OS 2.1 resources are under:
  - `compatibility/`
- block markup is written in Sline, not Handlebars

### Current Blind Box Status

Current Blind Box extension status is:

- active root still uses `assets/` and `locales/`
- no `compatibility: true`
- block markup is still Handlebars
- therefore it is not yet OS 3.0-native

## C. Store And App Linkage Check

- Confirm the app is installed in the same store used for Theme Editor testing.
- Confirm the extension was pushed from `extensions/theme-app-extension`.
- Confirm the latest draft was versioned and published after the most recent push.
- Confirm the test store handle is the one you are actually opening in Theme Editor.

Current locally observed install evidence:

- offline session found for `test-store-mnv`

If you test a different store, linkage is already broken.

## D. Theme Workflow Commands

### Install The OS 3.0 Theme CLI

```powershell
npm install --global @shoplineos/cli
sl --version
```

### Log In

```powershell
sl login --store=your-store.myshopline.com
```

### Pull The Current Theme For Audit

```powershell
mkdir C:\Users\manav\theme-audit
cd C:\Users\manav\theme-audit
shopline theme pull
```

### Create A Fresh Bottle-Based OS 3.0 Theme

```powershell
mkdir C:\Users\manav\blindbox-os3-theme-test
cd C:\Users\manav\blindbox-os3-theme-test
sl theme init blindbox-os3-theme-test
cd .\blindbox-os3-theme-test
sl theme serve
```

### Publish Or Upload The Test Theme

```powershell
sl theme package
sl theme push
```

## E. Theme Editor Test Steps

1. Open the same store used in CLI login.
2. Go to `Online Store -> Design`.
3. Open the OS 3.0 test theme.
4. Click `Design` or use the theme editor URL from `sl theme serve`.
5. Switch to a product-detail template.
6. Select a section that supports blocks.
7. Click `Add component`.
8. Open the `Apps` tab.
9. Look for `Blind Box product shell`.

## F. What Proves The Theme Is The Blocker

You can attribute the problem to the theme if:

- the current merchant theme is confirmed OS 2.1-style
- a clean OS 3.0 Bottle/custom theme shows the app block
- the app block appears in the OS 3.0 test theme without changing app type

That means:

- theme compatibility was the blocker
- theme replacement or theme upgrade is the next path

## G. What Proves The Extension Migration Is Still Missing

You should attribute the failure to the extension still being OS 2.1-style if:

- the theme is confirmed OS 3.0
- the current extension still uses Handlebars and `assets/locales`
- the app block still does not appear

That result is not yet enough to blame app type by itself.

## H. What Means "Switch To Public App Now"

Switch to public app now only after all of these are true:

- the test theme is confirmed OS 3.0
- the extension has been minimally migrated for OS 3.0:
  - `compatibility: true`
  - `public/`
  - `i18n/`
  - `components/`
  - `compatibility/`
  - Sline block syntax
- the migrated extension has been pushed again
- a new version has been created and published
- the app is installed in the same store used for Theme Editor testing
- the Apps tab still shows `0 components`

That is the point where the theme is no longer the strongest explanation, and moving to the public app path is justified.

## I. Final Decision Shortcut

- OS 2.1 theme -> theme test target is invalid
- OS 3.0 theme + old OS 2.1 extension -> result is directional, not conclusive
- OS 3.0 theme + minimally migrated OS 3.0 extension + still no block -> switch to public app now

## Official References

- OS 3.0 theme app extension get started: https://developer.shopline.com/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/get-started/?version=v20251201
- OS 3.0 theme app extension structure: https://developer.shopline.com/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/structure/?version=v20231201
- OS 2.1 to OS 3.0 extension migration guide: https://developer.shopline.com/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/migration-guide-from-os-2-1-to-os-3-0/?version=v20251201
- Build a custom OS 3.0 theme: https://developer.shopline.com/docs/online-store-3-0-themes/get-started/build-a-custom-theme/?version=v20260301
- OS 3.0 theme structure overview: https://developer.shopline.com/docs/online-store-3-0-themes/theme-structure/overview/?version=v20251201
