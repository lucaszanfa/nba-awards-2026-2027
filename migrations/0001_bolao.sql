CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  results TEXT NOT NULL,
  points TEXT NOT NULL,
  closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO settings (id, results, points) VALUES (
  1,
  '{"mvp":["","",""],"roy":["","",""],"coy":["","",""],"clutch":["","",""],"sixth":["","",""],"mip":["","",""]}',
  '{"mvp":{"exact":[10,5,3],"wrong":0},"roy":{"exact":[10,5,3],"wrong":0},"coy":{"exact":[10,5,3],"wrong":0},"clutch":{"exact":[10,5,3],"wrong":0},"sixth":{"exact":[10,5,3],"wrong":0},"mip":{"exact":[10,5,3],"wrong":0}}'
);
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  token_hash TEXT NOT NULL UNIQUE,
  picks TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
