-- Migration 042: per-variety 360 frame sequences.
--
-- variety_defaults holds two stills (photo_url = rough block, photo_alt_url =
-- polished slab). A 360 spin needs a whole sequence — 24 frames at 15 degrees
-- is the usual shoot — so frames go in their own table rather than as more
-- columns: the count varies per variety, and the library listing must stay
-- cheap to load.
--
-- Frames are data URIs, like the existing photos. That is the pattern this app
-- already uses, but it matters more here: 24 frames per variety across the
-- catalogue is the difference between a 2 MB database and a 200 MB one, so the
-- API caps frame size and the uploader downscales before sending. Frames are
-- deliberately NOT returned by the list endpoint — only a count — and are
-- fetched per variety when a card is actually expanded.

CREATE TABLE IF NOT EXISTS variety_frames (
  variety     TEXT    NOT NULL,
  idx         INTEGER NOT NULL,          -- 0-based position in the rotation
  data_url    TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (variety, idx),
  FOREIGN KEY (variety) REFERENCES variety_defaults(variety) ON DELETE CASCADE
);

-- Frames are always read as a whole ordered set for one variety.
CREATE INDEX IF NOT EXISTS idx_variety_frames_variety ON variety_frames(variety, idx);
