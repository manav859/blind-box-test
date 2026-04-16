export const INVENTORY_RECOVERY_HARDENING_MIGRATION = {
  name: '002_inventory_recovery_hardening',
  sql: `
    ALTER TABLE inventory_operations ADD COLUMN idempotency_key TEXT NULL;
    ALTER TABLE inventory_operations ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE inventory_operations ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE inventory_operations ADD COLUMN last_attempted_at TEXT NULL;
    ALTER TABLE inventory_operations ADD COLUMN processing_started_at TEXT NULL;
    ALTER TABLE inventory_operations ADD COLUMN completed_at TEXT NULL;

    UPDATE inventory_operations
    SET
      idempotency_key = COALESCE(NULLIF(external_reference, ''), id),
      status = CASE
        WHEN status = 'completed' THEN 'succeeded'
        ELSE status
      END
    WHERE idempotency_key IS NULL OR idempotency_key = '' OR status = 'completed';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_operations_shop_assignment_type_unique
      ON inventory_operations (shop, assignment_id, operation_type)
      WHERE assignment_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_operations_shop_idempotency_key_unique
      ON inventory_operations (shop, idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_inventory_operations_shop_status
      ON inventory_operations (shop, status);
  `,
};
