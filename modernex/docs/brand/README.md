# The Modernex Stones logo

Sister to the eModernex logo: the same stone block and granite speckle — but **sawn square** (sharp corners, square-cut ends, as
a granite block is cut), cut into slabs that lean together as they come off
the gang saw, the blade's cut running out through the block beneath them. No letter: the stone and the cut are the sign. The mark is in ghost style (line only, no fill, round ends) in the salt-and-pepper greys; beside it the
wordmark as the app's top bar sets it (`.tb-brand`): Inter ExtraBold, tight.

| File | Use |
|---|---|
| `modernex-logo.svg` | the logo in the text colour (`currentColor`) |
| `modernex-logo-on-light.svg`, `modernex-logo-on-dark.svg` | fixed colours: ink `#1f1f1f` on white; `#e8e8e8` on the dark top bar `#252526` |
| `modernex-mark.svg` (and `-on-light`, `-on-dark`) | the mark alone: the app icon, small places |
| `favicon.svg` | the browser tab: the mark without speckle on the top bar's grey |
| `logo-sheet.png` | how it looks at each size, on light and dark |

Below 24 px use the mark without the speckle (the favicon does). Keep clear space of half the mark's width around it. In the
app, the mark can sit before the existing `.tb-brand` text, drawn at about 1.3 × its font size.

Made by `make-logo.mjs` (opentype.js 1.3.4, Inter from @fontsource/inter 5.2.8 — SIL Open Font License, which allows its
letters as outlines in a logo): `node make-logo.mjs <out-dir> <path to inter-latin-800-normal.woff>`.
