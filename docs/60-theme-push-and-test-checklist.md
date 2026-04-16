# Theme Push And Test Checklist

Use this checklist when pushing the Blind Box theme app extension and verifying it in the connected SHOPLINE store.

## Push Checklist

- confirm you are in the repo root: `C:\Users\manav\blindbox-test-01`
- run `shopline login --store <STORE_DOMAIN>`
- switch into `extensions\blind-box-theme`
- if this folder should map to an existing remote extension, run `shopline extension connect`
- run `shopline extension push`
- open the developer-platform link printed by the CLI
- create and publish the new extension version

## Theme Editor Checklist

- open the connected store theme editor
- open a blind-box product template
- add the `Blind Box product shell` app block
- save the template after placement

## Visual Verification Checklist

- the block looks clean in desktop preview
- the block looks clean in mobile preview
- the badge and icon alignment are stable
- the title and description remain readable with default content
- long custom text does not overflow the layout
- hiding the explainer still leaves a balanced layout
- hiding the rarity note or disclaimer does not leave blank gaps
- a single optional note spans cleanly
- `compact`, `standard`, and `highlighted` all feel intentional on the product page

## Recommended First Test Configuration

Use this first:

- `Display layout: standard`
- `Information density: expanded`
- `Show purchase-flow explainer: on`
- `Show collectible note: on`
- `Show store disclaimer: on`

After that, test a lighter setup:

- `Display layout: compact`
- `Information density: compact`
- turn one or both optional note cards off

## What Merchants Should Not Expect Yet

This block still does not:

- reveal a final assigned item
- show live backend assignment state
- affect checkout
- trigger fulfillment

Those parts remain intentionally deferred.
