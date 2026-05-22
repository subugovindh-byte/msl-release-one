// ───────────────────────────────────────────────────────────────────
// seedVarietyDefaults.js — Loads reference photos into variety_defaults
//
// Runs on every server startup. Idempotent:
//   - Skips entries whose photo_url is already set
//   - Reads .jpg files from /seed-assets/variety-photos/
//   - Encodes as base64 data URI and stores in photo_url column
//
// To override later: run UPDATE on variety_defaults directly, or upload
// via the Variety Photo Library admin UI (added in v7).
// ───────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Filename → variety name mapping (source-of-truth; matches reference chart sheets)
const FILE_TO_VARIETY = {
  // Andhra
  'Black_Galaxy.jpg':       'Black Galaxy',
  'Tan_Brown.jpg':          'Tan Brown',
  'Viscont_White.jpg':      'Viscont White',
  'Kashmir_White.jpg':      'Kashmir White',
  'SK_Blue.jpg':            'S-K Blue',
  'Coffee_Brown.jpg':       'Coffee Brown',
  'Safari_Green.jpg':       'Safari Green',
  'Indian_Mahogany.jpg':    'Indian Mahogany',
  // Telangana
  'Steel_Grey.jpg':         'Steel Grey',
  'Green_Galaxy.jpg':       'Green Galaxy',
  'Jet_Black.jpg':          'Jet Black',
  'English_Oak.jpg':        'English Oak',
  'Indian_Brown.jpg':       'Indian Brown',
  'Colombo_Blue.jpg':       'Colombo Blue',
  'Colombo_Juparana.jpg':   'Colombo Juparana',
  'Classic_Yellowstone.jpg':'Classic Yellowstone',
  // Tamil Nadu
  'Mapple_Red.jpg':         'Mapple Red',
  'Warangal_Black.jpg':     'Warangal Black',
  'Sapphire_Brown.jpg':     'Sapphire Brown',
  'Paradiso_Classic.jpg':   'Paradiso Classic',
  'Kunnam_Black.jpg':       'Kunnam Black',
  'Multicolour_Red_2.jpg':  'Multicolour Red',
};

// Alternates (regional duplicates of the same variety — Telangana version of an Andhra stone).
// Stored in `photo_alt_url` so the user can switch in the UI.
const FILE_TO_ALTERNATE = {
  'Black_Galaxy_2.jpg':     'Black Galaxy',
  'Tan_Brown_2.jpg':        'Tan Brown',
  'Coffee_Brown_2.jpg':     'Coffee Brown',
  'Indian_Mahogany_2.jpg':  'Indian Mahogany',
};

export function seedVarietyDefaults(db, logger = console) {
  const photosDir = path.resolve(__dirname, '..', '..', 'seed-assets', 'variety-photos');

  if (!fs.existsSync(photosDir)) {
    logger.warn(`[seed] variety-photos directory not found at ${photosDir} — skipping`);
    return { loaded: 0, skipped: 0 };
  }

  const updateMain = db.prepare(`
    UPDATE variety_defaults
       SET photo_url = ?, updated_at = datetime('now')
     WHERE variety = ? AND (photo_url IS NULL OR photo_url = '')
  `);
  const updateAlt = db.prepare(`
    UPDATE variety_defaults
       SET photo_alt_url = ?, updated_at = datetime('now')
     WHERE variety = ? AND (photo_alt_url IS NULL OR photo_alt_url = '')
  `);

  let loaded = 0;
  let skipped = 0;

  // Main photos
  for (const [filename, variety] of Object.entries(FILE_TO_VARIETY)) {
    const filepath = path.join(photosDir, filename);
    if (!fs.existsSync(filepath)) {
      skipped++;
      continue;
    }
    const buf = fs.readFileSync(filepath);
    const dataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;
    const result = updateMain.run(dataUri, variety);
    if (result.changes > 0) {
      loaded++;
    } else {
      skipped++; // already had a photo, didn't overwrite
    }
  }

  // Alternates
  for (const [filename, variety] of Object.entries(FILE_TO_ALTERNATE)) {
    const filepath = path.join(photosDir, filename);
    if (!fs.existsSync(filepath)) continue;
    const buf = fs.readFileSync(filepath);
    const dataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;
    updateAlt.run(dataUri, variety);
  }

  logger.info(`[seed] variety_defaults: ${loaded} photos loaded, ${skipped} skipped (already had data or file missing)`);
  return { loaded, skipped };
}
