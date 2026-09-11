-- 0004: WhatsApp cart (multi-item inquiries, plan §30) + voice notes on items.
--
-- media.kind must accept 'audio'. SQLite cannot ALTER a CHECK constraint, so
-- the table is rebuilt. Three other tables reference media:
--   businesses.logo/cover_media_id, payments.proof_media_id  (NO ACTION →
--     must be detached before the drop and restored after)
--   item_media.media_id (ON DELETE CASCADE → the drop would wipe the join
--     rows, so they are backed up and re-inserted)
CREATE TABLE media_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  uploaded_by INTEGER REFERENCES users(id),
  driver TEXT NOT NULL DEFAULT 'd1' CHECK (driver IN ('d1','gateway')),
  storage_key TEXT NOT NULL UNIQUE,
  d1_blob BLOB,
  original_name TEXT,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image','video','audio','document')),
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  checksum TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','attached','unused','orphaned','deleted')),
  entity_type TEXT,
  entity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

INSERT INTO media_rebuild (
  id, business_id, uploaded_by, driver, storage_key, d1_blob, original_name,
  mime_type, extension, kind, size_bytes, width, height, duration, checksum,
  visibility, status, entity_type, entity_id, created_at, updated_at, deleted_at
)
SELECT
  id, business_id, uploaded_by, driver, storage_key, d1_blob, original_name,
  mime_type, extension, kind, size_bytes, width, height, duration, checksum,
  visibility, status, entity_type, entity_id, created_at, updated_at, deleted_at
FROM media;

-- back up + detach the NO ACTION references (blocking the drop)
CREATE TABLE _biz_ref AS SELECT id, logo_media_id, cover_media_id FROM businesses;
CREATE TABLE _pay_ref AS SELECT id, proof_media_id FROM payments;
-- back up the CASCADE join rows (the drop would cascade-delete them)
CREATE TABLE _im_bak AS SELECT listing_id, media_id, position, is_primary, alt_text FROM item_media;

UPDATE businesses SET logo_media_id = NULL, cover_media_id = NULL;
UPDATE payments SET proof_media_id = NULL;

DROP TABLE media;
ALTER TABLE media_rebuild RENAME TO media;
CREATE INDEX ix_media_business ON media(business_id, status);
CREATE INDEX ix_media_entity ON media(entity_type, entity_id);

-- restore (ids are preserved by the rebuild, so the references still resolve)
INSERT INTO item_media (listing_id, media_id, position, is_primary, alt_text)
  SELECT listing_id, media_id, position, is_primary, alt_text FROM _im_bak;
UPDATE businesses SET
  logo_media_id = (SELECT logo_media_id FROM _biz_ref WHERE _biz_ref.id = businesses.id),
  cover_media_id = (SELECT cover_media_id FROM _biz_ref WHERE _biz_ref.id = businesses.id);
UPDATE payments SET
  proof_media_id = (SELECT proof_media_id FROM _pay_ref WHERE _pay_ref.id = payments.id);
DROP TABLE _biz_ref;
DROP TABLE _pay_ref;
DROP TABLE _im_bak;

-- one voice note per listing (vendor-recorded description)
ALTER TABLE listings ADD COLUMN audio_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL;

-- multi-item cart inquiries: composed line items, as JSON
ALTER TABLE inquiries ADD COLUMN items_json TEXT;
