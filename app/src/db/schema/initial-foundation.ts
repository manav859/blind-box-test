export const INITIAL_FOUNDATION_MIGRATION = {
  name: '001_initial_blind_box_foundation',
  sql: `
    CREATE TABLE IF NOT EXISTS blind_boxes (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NULL,
      status TEXT NOT NULL,
      selection_strategy TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_blind_boxes_shop ON blind_boxes (shop);

    CREATE TABLE IF NOT EXISTS blind_box_pool_items (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      blind_box_id TEXT NOT NULL,
      label TEXT NOT NULL,
      source_product_id TEXT NULL,
      source_variant_id TEXT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      weight INTEGER NOT NULL DEFAULT 1,
      inventory_quantity INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (blind_box_id) REFERENCES blind_boxes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_blind_box_pool_items_shop ON blind_box_pool_items (shop);
    CREATE INDEX IF NOT EXISTS idx_blind_box_pool_items_blind_box_id ON blind_box_pool_items (blind_box_id);

    CREATE TABLE IF NOT EXISTS blind_box_product_mappings (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      blind_box_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_variant_id TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (blind_box_id) REFERENCES blind_boxes(id) ON DELETE CASCADE,
      UNIQUE (shop, product_id, product_variant_id)
    );

    CREATE INDEX IF NOT EXISTS idx_blind_box_product_mappings_shop ON blind_box_product_mappings (shop);
    CREATE INDEX IF NOT EXISTS idx_blind_box_product_mappings_blind_box_id ON blind_box_product_mappings (blind_box_id);

    CREATE TABLE IF NOT EXISTS blind_box_assignments (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      blind_box_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      order_line_id TEXT NOT NULL,
      selected_pool_item_id TEXT NULL,
      status TEXT NOT NULL,
      selection_strategy TEXT NULL,
      idempotency_key TEXT NOT NULL,
      metadata TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (blind_box_id) REFERENCES blind_boxes(id) ON DELETE CASCADE,
      FOREIGN KEY (selected_pool_item_id) REFERENCES blind_box_pool_items(id) ON DELETE SET NULL,
      UNIQUE (shop, order_id, order_line_id),
      UNIQUE (idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_blind_box_assignments_shop ON blind_box_assignments (shop);
    CREATE INDEX IF NOT EXISTS idx_blind_box_assignments_blind_box_id ON blind_box_assignments (blind_box_id);

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL DEFAULT '',
      topic TEXT NOT NULL,
      event_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL,
      error_message TEXT NULL,
      processed_at TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (shop, event_id)
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_events_topic ON webhook_events (topic);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_shop_status ON webhook_events (shop, status);

    CREATE TABLE IF NOT EXISTS inventory_operations (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      blind_box_id TEXT NULL,
      assignment_id TEXT NULL,
      pool_item_id TEXT NULL,
      operation_type TEXT NOT NULL,
      status TEXT NOT NULL,
      external_reference TEXT NULL,
      reason TEXT NULL,
      metadata TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (blind_box_id) REFERENCES blind_boxes(id) ON DELETE SET NULL,
      FOREIGN KEY (assignment_id) REFERENCES blind_box_assignments(id) ON DELETE SET NULL,
      FOREIGN KEY (pool_item_id) REFERENCES blind_box_pool_items(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_operations_shop ON inventory_operations (shop);
    CREATE INDEX IF NOT EXISTS idx_inventory_operations_assignment_id ON inventory_operations (assignment_id);
  `,
};
