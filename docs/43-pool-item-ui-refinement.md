# Pool Item UI Refinement

This refinement keeps the existing pool-item workflow intact while making the screen more usable for real operator work.

## Usability Issues Fixed

The previous pool-item screen had a few practical problems:

- `Not set` values wrapped badly and looked broken
- source product and variant ids were hard to scan in the table
- readiness output was too dense inside a single table cell
- table columns competed for space and made important data feel cramped
- the add/edit panel lacked clear hierarchy between item settings, SHOPLINE ids, and readiness results

## What Changed

### Pool items table

The table now uses clearer column sizing and a fixed layout tuned for operator scanning:

- the table gets more space for source identifiers and readiness
- inventory and updated columns stay compact
- action buttons stay aligned without squeezing the rest of the row

### Source identifiers

`sourceProductId` and `sourceVariantId` are now displayed in dedicated identifier blocks:

- monospace presentation
- horizontal overflow instead of ugly line wrapping
- clean `Not set` pills that do not break across lines
- clearer label/value separation for Product vs Variant

### Readiness display

The table now shows readiness as a concise summary:

- one readiness badge
- one short status line
- one short summary line

Detailed readiness explanation stays in the side panel, where operators can actually read it.

### Add/Edit panel

The right-side panel now has clearer structure:

- Pool item details
- SHOPLINE execute-mode identifiers
- Operational notes
- Readiness result

This makes the workflow much easier to follow during live-store testing:

1. paste real source ids
2. save the pool item
3. run readiness
4. read the detailed result in the same panel

## How This Improves Execute-Mode Validation

The refined screen now supports connected-store testing more directly:

- operators can scan which pool items have real ids configured
- readiness no longer competes with raw identifier text in the table
- the side panel becomes the readable source of truth for execute-mode validation details
- clicking readiness from the table also focuses that item in the side panel, so the operator immediately sees the full validation result

This makes the screen feel like an operational tool rather than a squeezed setup prototype.
