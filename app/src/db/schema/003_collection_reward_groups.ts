export const COLLECTION_REWARD_GROUPS_MIGRATION = {
  name: '003_collection_reward_groups',
  sql: `
    ALTER TABLE blind_boxes ADD COLUMN shopline_product_id TEXT NULL;
    ALTER TABLE blind_boxes ADD COLUMN shopline_variant_id TEXT NULL DEFAULT '';
    ALTER TABLE blind_boxes ADD COLUMN product_title_snapshot TEXT NULL;
    ALTER TABLE blind_boxes ADD COLUMN config_json TEXT NULL;

    CREATE INDEX IF NOT EXISTS idx_blind_boxes_shopline_product_id
      ON blind_boxes (shop, shopline_product_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_blind_boxes_shop_product_variant_unique
      ON blind_boxes (shop, shopline_product_id, shopline_variant_id)
      WHERE shopline_product_id IS NOT NULL AND shopline_product_id != '';

    CREATE TABLE IF NOT EXISTS reward_groups (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      source_type TEXT NOT NULL,
      shopline_collection_id TEXT NOT NULL,
      collection_title_snapshot TEXT NULL,
      status TEXT NOT NULL,
      config_json TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (shop, source_type, shopline_collection_id)
    );

    CREATE INDEX IF NOT EXISTS idx_reward_groups_shop ON reward_groups (shop);
    CREATE INDEX IF NOT EXISTS idx_reward_groups_shopline_collection_id
      ON reward_groups (shop, shopline_collection_id);

    CREATE TABLE IF NOT EXISTS blind_box_reward_group_links (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      blind_box_id TEXT NOT NULL,
      reward_group_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (blind_box_id) REFERENCES blind_boxes(id) ON DELETE CASCADE,
      FOREIGN KEY (reward_group_id) REFERENCES reward_groups(id) ON DELETE CASCADE,
      UNIQUE (shop, blind_box_id)
    );

    CREATE INDEX IF NOT EXISTS idx_blind_box_reward_group_links_shop
      ON blind_box_reward_group_links (shop);
    CREATE INDEX IF NOT EXISTS idx_blind_box_reward_group_links_reward_group_id
      ON blind_box_reward_group_links (reward_group_id);

    ALTER TABLE blind_box_assignments ADD COLUMN reward_group_id TEXT NULL;
    ALTER TABLE blind_box_assignments ADD COLUMN selected_reward_product_id TEXT NULL;
    ALTER TABLE blind_box_assignments ADD COLUMN selected_reward_variant_id TEXT NULL;
    ALTER TABLE blind_box_assignments ADD COLUMN selected_reward_title_snapshot TEXT NULL;
    ALTER TABLE blind_box_assignments ADD COLUMN selected_reward_variant_title_snapshot TEXT NULL;
    ALTER TABLE blind_box_assignments ADD COLUMN selected_reward_payload_json TEXT NULL;

    CREATE INDEX IF NOT EXISTS idx_blind_box_assignments_reward_group_id
      ON blind_box_assignments (reward_group_id);
    CREATE INDEX IF NOT EXISTS idx_blind_box_assignments_reward_product_id
      ON blind_box_assignments (shop, selected_reward_product_id);

    ALTER TABLE inventory_operations ADD COLUMN reward_group_id TEXT NULL;
    ALTER TABLE inventory_operations ADD COLUMN reward_product_id TEXT NULL;
    ALTER TABLE inventory_operations ADD COLUMN reward_variant_id TEXT NULL;
    ALTER TABLE inventory_operations ADD COLUMN reward_title_snapshot TEXT NULL;
    ALTER TABLE inventory_operations ADD COLUMN reward_variant_title_snapshot TEXT NULL;

    CREATE INDEX IF NOT EXISTS idx_inventory_operations_reward_product_id
      ON inventory_operations (shop, reward_product_id);
  `,
};
