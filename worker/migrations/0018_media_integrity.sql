-- A gateway write is registered at most once, with its upload token consumed
-- in the same D1 batch. Existing media remains unchanged and unclaimed.
ALTER TABLE media ADD COLUMN upload_token TEXT;
CREATE UNIQUE INDEX uq_media_upload_token ON media(upload_token) WHERE upload_token IS NOT NULL;
