# The room's fonts

Three families, each under the SIL Open Font License 1.1 with its license beside it, each pinned by `fonts.lock` (schema 2). Each family's uses say where it may appear (spec 004, Amendment B10; its data-model.md §7.2):

| Family | Files | Uses | Source | License |
|---|---|---|---|---|
| IBM Plex Sans | `IBMPlexSans-Regular.woff`, `IBMPlexSans-Bold.woff` | site, pdf, room | `@ibm/plex-sans` 1.1.0, published 2024-11-11 | `LICENSE.txt`, with IBM's Reserved Font Name "Plex" |
| IBM Plex Mono | `IBMPlexMono-Regular.woff`, weight 400 | room | `@ibm/plex-mono` 2.5.0, published 2026-06-11 | `LICENSE.txt`, the same file, with the same Reserved Font Name |
| Patrick Hand | `patrick-hand-latin-400-normal.woff`, latin, weight 400 | room | `@fontsource/patrick-hand` 5.3.0, published 2026-07-19 | `LICENSE-PatrickHand.txt`, reserving no font name |

- **site**: the site's CSS (`src/fonts.css`) serves the family for the page's own text.
- **pdf**: the resume's PDF (`build/pdf.ts`) embeds the family, subset. Only IBM Plex Sans holds this use, so the PDF embeds no other font (spec 002, T028; contracts/resume-source.md §4, as spec 004's Amendment B10 keeps it).
- **room**: the room's live faces may draw with the family (spec 004's research.md R-38): IBM Plex Mono for the monitor's terminal and the neon sign's counters, IBM Plex Sans for the desktop half and, in Bold, the neon word, and Patrick Hand for the chalkboard. A look picks among the families that hold this use, so changing one is a data edit (FR-033). The site's CSS declares their faces too, and a browser fetches a face only once something uses it.

## Where they came from

Each from its release on the npm registry, taken with `npm pack`, never installed, so no package's install script ran (IBM's packages carry a telemetry hook). Each tarball matched the registry's `sha512` integrity before anything was taken from it.

- **IBM Plex Sans:** `@ibm/plex-sans` 1.1.0 (published 2024-11-11, the newest release; IBM publishes Plex there from its `ibm/plex` repository), downloaded on 2026-10-18 as `https://registry.npmjs.org/@ibm/plex-sans/-/plex-sans-1.1.0.tgz`, and again on 2026-10-23 for `npm run fonts:lock`, the same bytes. The font files are copied unchanged from `package/fonts/complete/woff/`, and the license from `package/LICENSE.txt` with its words unchanged and its line endings LF, as the repository's `.gitattributes` stores text.
- **IBM Plex Mono:** `@ibm/plex-mono` 2.5.0 (published 2026-06-11, the newest release, from the same repository), downloaded on 2026-10-23. Its regular weight is copied unchanged from `package/fonts/complete/woff/IBMPlexMono-Regular.woff`: the complete file, not a subset, since Plex reserves its name, and only IBM's own release is vendored (B10). Its license, `package/LICENSE.txt`, has the same words as Plex Sans's, and with LF line endings the same bytes, so `LICENSE.txt` serves both families and `fonts.lock` names it under each.
- **Patrick Hand:** `@fontsource/patrick-hand` 5.3.0 (published 2026-07-19, the newest release; Fontsource packages the Google Fonts families), downloaded on 2026-10-23. Its latin subset at weight 400 is copied unchanged from `package/files/patrick-hand-latin-400-normal.woff`, and its license unchanged from `package/LICENSE`, as `LICENSE-PatrickHand.txt`. Patrick Hand reserves no font name, so a subset such as Fontsource's may be used (B10; Confirmation 7).

`fonts.lock` records each tarball's URL, SHA-256, and integrity, and each file's SHA-256 and path in its tarball. The build refuses a font whose bytes don't match it (`loadFonts`), and `test/fonts.test.ts` checks every file of every family.

WOFF rather than WOFF2: PDFKit's font library, fontkit, can't subset Plex's WOFF2 files (its composite glyphs fail), and every current browser reads WOFF, so one file serves both. The room's two families come as WOFF too, and fontkit reads their metrics the same way.

## Changing a font

1. Declare the release in `build/fonts-lock.ts`'s `FAMILIES`: the package and version, the registry's integrity (`npm view <package>@<version> dist.integrity`) and publication date, the family's license, reserved font name, and uses, and each file with its path in the tarball.
2. Take every family's tarball, each into a new, empty folder: `npm pack <package>@<version> --ignore-scripts`.
3. Run `npm run fonts:lock -w apps/web -- --copy <each tarball, by its absolute path>`.

The script finds each tarball's family by its integrity before it reads a file from it, copies the declared files in unchanged (a license's line endings aside, as its entry notes), checks every vendored file against its tarball's, and rewrites `fonts.lock` with every digest computed, never typed. Without `--copy` it only checks. The PDF's bytes change with the PDF's family, so the resume needs no new approval, but the change is a reviewed commit like any other.
