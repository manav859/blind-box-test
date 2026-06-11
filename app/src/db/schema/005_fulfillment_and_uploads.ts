// Migration 005 — internal fulfillment tracking + self-hosted image uploads.
//
// - blind_box_assignments.shipped_at: when the merchant marked the reward as
//   shipped (internal tracking only; never calls SHOPLINE's fulfillment API).
// - uploaded_images: merchant-uploaded product images stored in Postgres and
//   served from a public app URL, which is then passed to SHOPLINE as
//   media.original_source (SHOPLINE fetches and rehosts it).
//
// IDEMPOTENT: column add is guarded; table create uses IF NOT EXISTS.
export const FULFILLMENT_AND_UPLOADS_MIGRATION = {
  name: '005_fulfillment_and_uploads',
  sql: `
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'blind_box_assignments' AND column_name = 'shipped_at') THEN
        ALTER TABLE blind_box_assignments ADD COLUMN shipped_at TEXT NULL;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS uploaded_images (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      content_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_uploaded_images_shop ON uploaded_images (shop);
  `,
};
