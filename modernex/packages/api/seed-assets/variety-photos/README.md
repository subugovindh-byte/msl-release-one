# Variety Reference Photos

These are reference photos cropped from Modernex's product chart sheets. They serve as **default placeholder images** for each variety in the inventory.

## How they're used

When a product is created without a custom photo, the system falls back to:
1. **Per-product photo** (uploaded via the camera workflow) — highest priority
2. **Variety reference photo** (from this folder) — fallback default
3. **Generic placeholder** — last resort

## Mapping

The seed script (`packages/api/src/db/seed.js`) reads from this folder when bootstrapping the `variety_defaults` table on first run. Each filename maps to a variety name as follows:

| Filename | Variety | Region |
|---|---|---|
| Black_Galaxy.jpg | Black Galaxy | Andhra |
| Tan_Brown.jpg | Tan Brown | Andhra |
| Viscont_White.jpg | Viscont White | Andhra |
| Kashmir_White.jpg | Kashmir White | Andhra |
| SK_Blue.jpg | S-K Blue | Andhra |
| Coffee_Brown.jpg | Coffee Brown | Andhra |
| Safari_Green.jpg | Safari Green | Andhra |
| Indian_Mahogany.jpg | Indian Mahogany | Andhra |
| Steel_Grey.jpg | Steel Grey | Telangana |
| Green_Galaxy.jpg | Green Galaxy | Telangana |
| Jet_Black.jpg | Jet Black | Telangana |
| English_Oak.jpg | English Oak | Telangana |
| Indian_Brown.jpg | Indian Brown | Telangana |
| Colombo_Blue.jpg | Colombo Blue | Telangana |
| Colombo_Juparana.jpg | Colombo Juparana | Telangana |
| Classic_Yellowstone.jpg | Classic Yellowstone | Telangana |
| Mapple_Red.jpg | Mapple Red | Tamil Nadu |
| Warangal_Black.jpg | Warangal Black | Tamil Nadu |
| Sapphire_Brown.jpg | Sapphire Brown | Tamil Nadu |
| Paradiso_Classic.jpg | Paradiso Classic | Tamil Nadu |
| Kunnam_Black.jpg | Kunnam Black | Tamil Nadu |
| Multicolour_Red_2.jpg | Multicolour Red | Tamil Nadu |

`*_2.jpg` files (Black_Galaxy_2, Tan_Brown_2, Coffee_Brown_2, Indian_Mahogany_2) are **alternate regional sources** of the same trade-name variety — Telangana-sourced versions of stones also produced in Andhra. The seed script uses the primary one by default and stores the alternates as supplementary references.

## Replacing photos

To swap a reference photo:

1. Drop a new `.jpg` (recommended ≤ 5KB, 200×140px) into this folder using the same filename
2. Re-run `npm run db:seed-variety-photos` (added in v7)
3. The `variety_defaults` table will pick up the new file on next product list load

Original product chart sheets (the Andhra/Telangana/TN composite images) live in `seed-assets/source-charts/` for traceability.

## File sizes

All photos are 200×140px JPEG quality 72, totaling ~95KB. Loading 26 photos with this size adds ~2ms to first render and is cached by the browser thereafter.
