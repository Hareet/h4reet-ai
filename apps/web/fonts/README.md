# The room's font

IBM Plex Sans, Regular and Bold, under the SIL Open Font License 1.1 (`LICENSE.txt`, with IBM's Reserved Font Name "Plex"). The site's CSS (`src/fonts.css`) serves these two files, and the PDF (`build/pdf.ts`) embeds them, subset. No other font is used (spec 002, T028; contracts/resume-source.md §4).

## Where they came from

The upstream release on the npm registry, `@ibm/plex-sans` 1.1.0 (published 2024-11-11, the newest release; IBM publishes Plex there from its `ibm/plex` repository), downloaded on 2026-10-18 as `https://registry.npmjs.org/@ibm/plex-sans/-/plex-sans-1.1.0.tgz`. The tarball matched the registry's `sha512` integrity before anything was taken from it. The font files are copied unchanged from `package/fonts/complete/woff/`, and the license from `package/LICENSE.txt` with its words unchanged and its line endings LF, as the repository's `.gitattributes` stores text. The package's install script, an IBM telemetry hook, never ran, because the package was never installed.

`fonts.lock` records the tarball's URL, SHA-256, and integrity, and each file's SHA-256 and path in the tarball. The build refuses a font whose bytes don't match it (`loadFonts`), and `test/fonts.test.ts` checks every file.

WOFF rather than WOFF2: PDFKit's font library, fontkit, can't subset Plex's WOFF2 files (its composite glyphs fail), and every current browser reads WOFF, so one file serves both.

## Changing the font

Download the new release's tarball, check it against the registry's integrity, copy the files in unchanged, and rewrite `fonts.lock` with every digest computed by a script, never typed. The PDF's bytes change with the font, so the resume needs no new approval, but the change is a reviewed commit like any other.
