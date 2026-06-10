// Migration 004 — replace the tag/collection model with explicit product
// selection. Blind boxes now reference a trigger product directly and the pool
// (blind_box_pool_items) holds reward products; selection is inventory-weighted
// at resolution time, so per-item weight / selection_strategy are removed.
//
// IDEMPOTENT: every rename/drop is guarded by an information_schema existence
// check (PL/pgSQL DO blocks) so re-running — or a retry after a partial run — is
// a no-op. The migration runner also wraps this in a transaction and records the
// migration name only on success.
export const EXPLICIT_PRODUCT_SELECTION_MIGRATION = {
  name: '004_explicit_product_selection',
  sql: `
    -- ── blind_boxes: shopline_* → trigger_*, drop variant + strategy ──────────
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_boxes' AND column_name = 'shopline_product_id') THEN
        ALTER TABLE blind_boxes RENAME COLUMN shopline_product_id TO trigger_product_id;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_boxes' AND column_name = 'product_title_snapshot') THEN
        ALTER TABLE blind_boxes RENAME COLUMN product_title_snapshot TO trigger_product_title_snapshot;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_boxes' AND column_name = 'shopline_variant_id') THEN
        ALTER TABLE blind_boxes DROP COLUMN shopline_variant_id;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_boxes' AND column_name = 'selection_strategy') THEN
        ALTER TABLE blind_boxes DROP COLUMN selection_strategy;
      END IF;
    END $$;

    -- Box matches at PRODUCT level — unique trigger product per shop.
    DROP INDEX IF EXISTS idx_blind_boxes_shop_product_variant_unique;
    DROP INDEX IF EXISTS idx_blind_boxes_shopline_product_id;
    CREATE INDEX IF NOT EXISTS idx_blind_boxes_trigger_product_id
      ON blind_boxes (shop, trigger_product_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_blind_boxes_shop_trigger_product_unique
      ON blind_boxes (shop, trigger_product_id)
      WHERE trigger_product_id IS NOT NULL AND trigger_product_id != '';

    -- ── blind_box_pool_items: source_* → reward_*, drop weight/enabled/qty ─────
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_box_pool_items' AND column_name = 'source_product_id') THEN
        ALTER TABLE blind_box_pool_items RENAME COLUMN source_product_id TO reward_product_id;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_box_pool_items' AND column_name = 'source_variant_id') THEN
        ALTER TABLE blind_box_pool_items RENAME COLUMN source_variant_id TO reward_variant_id;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_box_pool_items' AND column_name = 'label') THEN
        ALTER TABLE blind_box_pool_items RENAME COLUMN label TO reward_title_snapshot;
      END IF;

      -- reward_title_snapshot must allow NULL (renamed from a NOT NULL label).
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_box_pool_items' AND column_name = 'reward_title_snapshot') THEN
        ALTER TABLE blind_box_pool_items ALTER COLUMN reward_title_snapshot DROP NOT NULL;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_box_pool_items' AND column_name = 'weight') THEN
        ALTER TABLE blind_box_pool_items DROP COLUMN weight;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_box_pool_items' AND column_name = 'enabled') THEN
        ALTER TABLE blind_box_pool_items DROP COLUMN enabled;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_box_pool_items' AND column_name = 'inventory_quantity') THEN
        ALTER TABLE blind_box_pool_items DROP COLUMN inventory_quantity;
      END IF;

      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'blind_box_pool_items' AND column_name = 'metadata') THEN
        ALTER TABLE blind_box_pool_items DROP COLUMN metadata;
      END IF;
    END $$;

    -- ── drop the collection reward model (services/routes deleted in code) ─────
    DROP TABLE IF EXISTS blind_box_reward_group_links;
    DROP TABLE IF EXISTS reward_groups;
  `,
};
