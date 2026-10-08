ALTER TABLE participants ADD COLUMN name_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS participants_name_key ON participants(name_key) WHERE name_key IS NOT NULL;
