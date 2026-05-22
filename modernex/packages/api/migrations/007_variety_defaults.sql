-- ════════════════════════════════════════════════════════
-- MIGRATION 007 — variety reference photos
--
-- Adds a `variety_defaults` table that holds per-variety reference
-- photos. When a product has no custom uploaded photo, the frontend
-- falls back to the variety default. When that's also missing, it
-- falls back to a generic SVG placeholder.
--
-- The seed script (seedVarietyDefaults.js) populates this from
-- /seed-assets/variety-photos/ on first run.
-- ════════════════════════════════════════════════════════

CREATE TABLE variety_defaults (
  variety        TEXT PRIMARY KEY,
  region         TEXT,                        -- Andhra / Telangana / Tamil Nadu / Karnataka / Other
  photo_url      TEXT,                        -- Blob URL or data URI
  photo_alt_url  TEXT,                        -- Optional alternate (e.g. polished slab vs rough block)
  source         TEXT DEFAULT 'reference',    -- reference | uploaded | imported
  notes          TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT
);

CREATE INDEX idx_variety_defaults_region ON variety_defaults(region);
CREATE INDEX idx_variety_defaults_active ON variety_defaults(active);

-- Insert known regional varieties (photos populated by seed script)
INSERT INTO variety_defaults (variety, region, source, notes) VALUES
  -- Andhra Pradesh
  ('Black Galaxy',         'Andhra',     'reference', 'Ongole region, gabbric anorthosite with golden flecks'),
  ('Tan Brown',            'Andhra',     'reference', 'Archean porphyritic granite'),
  ('Viscont White',        'Andhra',     'reference', 'Cream/grey base with subtle veining'),
  ('Kashmir White',        'Andhra',     'reference', 'White base with red-brown garnet flecks'),
  ('S-K Blue',             'Andhra',     'reference', 'Steel-blue grey'),
  ('Coffee Brown',         'Andhra',     'reference', 'Dark brown with black/gold flecks'),
  ('Safari Green',         'Andhra',     'reference', 'Dark green-brown'),
  ('Indian Mahogany',      'Andhra',     'reference', 'Reddish-brown'),
  -- Telangana
  ('Steel Grey',           'Telangana',  'reference', 'Karimnagar region, mid-grey'),
  ('Green Galaxy',         'Telangana',  'reference', 'Dark green base with metallic flecks'),
  ('Jet Black',            'Telangana',  'reference', 'Pure black, fine grain'),
  ('English Oak',          'Telangana',  'reference', 'Dark grey with wave pattern'),
  ('Indian Brown',         'Telangana',  'reference', 'Rich brown'),
  ('Colombo Blue',         'Telangana',  'reference', 'Dark grey-blue with wavy bands'),
  ('Colombo Juparana',     'Telangana',  'reference', 'Beige with wavy banding'),
  ('Classic Yellowstone',  'Telangana',  'reference', 'Cream/yellow with wavy pattern'),
  -- Tamil Nadu
  ('Mapple Red',           'Tamil Nadu', 'reference', 'Bright red'),
  ('Warangal Black',       'Tamil Nadu', 'reference', 'Pure black'),
  ('Sapphire Brown',       'Tamil Nadu', 'reference', 'Dark brown with wavy bands'),
  ('Paradiso Classic',     'Tamil Nadu', 'reference', 'Krishnagiri/Chendarapalli, wavy purple-grey on warm base'),
  ('Kunnam Black',         'Tamil Nadu', 'reference', 'Pure black, premium polish'),
  ('Multicolour Red',      'Tamil Nadu', 'reference', 'Red base with wave pattern');
