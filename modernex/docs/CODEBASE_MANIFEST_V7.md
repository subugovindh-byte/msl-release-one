# Modernex Codebase v7 — File Manifest

**Archive:** `modernex-codebase-v7.tar.gz` · 212 KB · 130 files
**Standalone:** `ModernexApp_Standalone.html` · 226 KB · single-file browser demo

## What's new in v7

Real reference photos for every variety, with a per-variety photo library admin page so you can swap them out anytime.

- **22 reference photo thumbnails** cropped from your Andhra/Telangana/Tamil Nadu chart sheets, embedded directly in the codebase as JPEGs (~95 KB total)
- **`variety_defaults` table** — one row per variety with photo URL, region, and notes. Auto-seeded on first server start
- **15 new regional products** added to the seed (Viscont White, S-K Blue, Safari Green, Indian Mahogany, Jet Black, Green Galaxy, English Oak, Indian Brown, Colombo Blue, Colombo Juparana, Classic Yellowstone, Mapple Red, Warangal Black, Sapphire Brown, Kunnam Black)
- **Variety Photo Library admin page** (`/variety-photos`) — admin can browse all 22 varieties grouped by region and upload replacement photos at any time
- **Photo resolution helper** — every product card now resolves its image as: per-product custom photo → variety reference → graceful fallback
- **Photos visible on POS and Inventory pages** — every product card and inventory row now shows the proper variety photo

## Photo resolution priority

When rendering any product image, the system checks in order:

1. **Per-product photo** (`product.photo_url`) — uploaded via the camera workflow on a specific product, highest priority
2. **Variety reference photo** (`variety_defaults.photo_url`) — the regional reference photo for that variety
3. **Empty placeholder** — small box with dashed border so the layout doesn't collapse

This means a yard worker's individual photo of slab S001 always wins over the generic Paradiso Classic reference, but if no individual photo exists, the Paradiso reference renders. If the variety isn't in the defaults table at all (custom variety added by the user), an empty box renders.

## Variety photo library

New admin page at `/variety-photos`. Shows every known variety as a card with:

- Current photo (or "No photo" placeholder)
- Variety name
- Region tag (Andhra / Telangana / Tamil Nadu)
- Source (`reference` = seeded, `uploaded` = admin-replaced)
- Description notes
- Upload button

Click "Upload Photo", pick any image from disk, and the database is updated. The new photo flows immediately to all products of that variety on every page (POS, Inventory, Products) the next time the page loads. Photos are stored as base64 data URIs in the database (max 5 MB each, validated server-side).

## Files added (10) · Files modified (5)

### Added

| File | What it does |
|---|---|
| `packages/api/migrations/007_variety_defaults.sql` | Creates `variety_defaults` table, inserts 22 known varieties with regions and notes (no photos yet — those come from seed) |
| `packages/api/src/db/seedVarietyDefaults.js` | On startup, reads JPEG files from `seed-assets/variety-photos/`, encodes as base64 data URIs, inserts into `variety_defaults.photo_url`. Idempotent — won't overwrite admin uploads |
| `packages/api/src/routes/varietyDefaults.js` | Express router. `GET /api/variety-defaults` (returns dict for frontend), `PATCH /api/variety-defaults/:variety` (admin-only override) |
| `packages/api/seed-assets/variety-photos/` | Folder with 26 JPEG files (95 KB total) — 22 primary references + 4 alternates |
| `packages/api/seed-assets/variety-photos/README.md` | Documentation: filename → variety mapping, replacement instructions |
| `packages/web/src/utils/varietyDefaults.js` | React hook `useVarietyDefaults()` with singleton cache (one fetch per session). Helper `resolveProductPhoto(product, varietyMap)` for the photo priority chain |
| `packages/web/src/pages/VarietyPhotosPage.jsx` | Admin Variety Photo Library — region filter, card grid with upload button per variety |

### Modified

| File | Change |
|---|---|
| `packages/api/src/db/migrate.js` | Calls `seedVarietyDefaults()` after migrations apply (in transaction) |
| `packages/api/src/server.js` | Registers `/api/variety-defaults` route |
| `packages/api/src/db/seed.js` | Inserts 15 new regional varieties as products in the `products` table after the legacy slab seed runs |
| `packages/web/src/pages/POSPage.jsx` | Imports `useVarietyDefaults` hook, passes `varietyMap` to ProductCard, renders `<img>` thumbnail at top of each card |
| `packages/web/src/pages/InventoryPage.jsx` | Imports the hook, adds new "Photo" column at left of inventory table (40×32 px thumbnail per row) |
| `packages/web/src/App.jsx` | Adds `/variety-photos` route + nav entry under Setup section |

## The 22 reference varieties (with regions)

### Andhra Pradesh (8)
Black Galaxy · Tan Brown · Viscont White · Kashmir White · S-K Blue · Coffee Brown · Safari Green · Indian Mahogany

### Telangana (8)
Steel Grey · Green Galaxy · Jet Black · English Oak · Indian Brown · Colombo Blue · Colombo Juparana · Classic Yellowstone

### Tamil Nadu (6)
Mapple Red · Warangal Black · Sapphire Brown · Paradiso Classic · Kunnam Black · Multicolour Red

Plus 4 alternates (regional duplicates of Andhra varieties also produced in Telangana): Black Galaxy 2, Tan Brown 2, Coffee Brown 2, Indian Mahogany 2.

## Migration path from v6

Same as before — extract, install, start. Migration 007 runs on first start, creating the `variety_defaults` table. The seed script then loads the 22 photos from `seed-assets/variety-photos/` into the database. Existing v6 data (products, invoices, customers, etc.) is preserved.

After upgrade, products immediately show their reference photos in POS and Inventory. To change a photo: admin → Variety Photos → Upload.

## How to test

1. Extract and start: `tar -xzf modernex-codebase-v7.tar.gz && cd modernex && npm install && cp .env.example .env && npm run dev`
2. Login `admin` / `admin123`
3. **POS** → click "Slabs" filter → see the 15 regional varieties side-by-side, each with its real photo at the top of the card
4. **Inventory** → table now shows a small thumbnail at the left of every row
5. **Variety Photos** (admin only, in left nav under Setup) → see all 22 varieties grouped by region. Click "Upload Photo" on any one → pick any image from disk → it saves and immediately reflects everywhere
6. **Override priority**: take a photo of a specific slab via the camera workflow on a product → that photo overrides the variety reference for that product only

## Known imperfections

The cropped reference photos came from your composite chart sheets. Some thumbnails have a thin sliver of the neighboring block bleeding in at the edge (column boundaries on the chart aren't perfectly aligned to fixed pixel offsets). At the 40×32 thumbnail size used in the inventory table and 60px height in POS cards, this is barely visible. To get pixel-perfect crops, replace any photo via the Variety Photos admin page with a properly framed shot.

The Telangana chart had a partial 4th row (Indian Brown / Colombo Blue / Colombo Juparana / Classic Yellowstone) where labels were cut off. I cropped what was visible based on the column positions of the rows above. If any of these four don't match the actual stone, upload corrected photos via the admin page.

## Spelling notes

I committed these spellings as-is from your charts:

- `Viscont White` (the chart says "Viscontt" — assumed typo, used "Viscont")
- `Mapple Red` (kept as-is from chart, even though "Maple Red" might be intended)
- `S-K Blue` (kept hyphen from chart)
- `Indian Brown` (the chart says "Indian Broun" — assumed typo, used "Indian Brown")

If any of these need different spelling, search-and-replace in `migrations/007_variety_defaults.sql`, `db/seed.js`, and `db/seedVarietyDefaults.js` before first server start. Or after start, the variety name is the primary key in `variety_defaults`, so renaming requires a SQL update + a corresponding update to any products using that variety. Easier: just rename in the source files before deploying.

## Backward compatibility

All v6 functionality unchanged:
- 10 product kinds still work (block/slab/tile/cts/strip/kerb/cobble/chips/dust/monument)
- Standard specs picklists still in the inventory create modal
- Multi-HSN GST still calculated correctly across mixed-kind invoices
- Rate edits at all 4 levels still work
- QR codes for all kinds still generate
- Per-product custom photo upload via camera still overrides the new variety reference

If you don't want the new behavior, ignore it — products without a `photo_url` and without a matching `variety_defaults` entry just render the empty placeholder, same as v6.

## v6 → v7 change summary

| Aspect | v6 | v7 |
|---|---|---|
| Variety reference photos | None — only per-product custom uploads | **22 default photos** auto-seeded on startup |
| Variety photo management UI | Did not exist | **Variety Photo Library admin page** with per-variety upload |
| Regional varieties seeded | No (just demo Paradiso/Tan Brown/etc.) | **15 regional varieties** across Andhra/Telangana/TN |
| Photo resolution chain | per-product → SVG | per-product → **variety default** → empty box |
| Database schema | 6 migrations | 7 (added `variety_defaults`) |
| File count | 98 | **130** (added 26 photos + 6 code files) |
