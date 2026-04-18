# Merchant Configuration Guide

## Embedded Admin Status

The embedded app no longer exposes a blind-box configuration dashboard.

Blind-box setup now happens in SHOPLINE admin only.

## Required Merchant Setup

### 1. Create The Reward Collection In SHOPLINE Admin

Create or update a SHOPLINE collection that contains the reward products.

Requirements:

- reward products must be active
- reward products must be published to Online Store
- the blind-box sold product must not be inside this same collection

### 2. Create The Blind-Box Product In SHOPLINE Admin

Create the normal product customers will buy.

Requirements:

- active
- published to Online Store
- uses the native SHOPLINE product page and checkout flow

### 3. Add Product Tags

Add these tags to the sold product:

- `blind-box`
- `blind-box-collection:<collection_handle>`

Example:

- `blind-box`
- `blind-box-collection:anime-figures`

### 4. Validate Inventory If Execute Mode Is Enabled

If the backend is running in execute mode:

- reward variants must be inventory-tracked
- reward variants must be linked to the configured SHOPLINE location
- reward variants must have available stock at that location

### 5. Sell Normally

Customers buy the blind-box product through the native SHOPLINE storefront.

After the order is paid, the backend:

- detects the blind-box product from tags
- resolves the reward collection by handle
- filters eligible candidates
- persists the assignment idempotently
- validates inventory in execute mode
