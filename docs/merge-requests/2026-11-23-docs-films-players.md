# docs/films-players

Spec: specs/023-resume-pdf-with-film-links/ (FR-012, amended 2026-11-23: the landing pages offer the release's file) · Written by: Claude Code (the Author's session) · Date: 2026-11-23
Session: /tmp/claude-1000/wt-players (worktree of /home/h4reet/h4reet-ai/h4reet-ai) · Repo hooks active: yes
Authorized by: the Author's request of 2026-11-23, "Let's get the resume links to work!", and his uploads of the seven web encodes

## What changed and why

The resume PDF links each of its four film claims to the film's folder on GitHub
(`https://github.com/hareet/h4reet-ai/tree/main/films/<name>`), where GitHub renders the folder's `README.md`. Until now
each landing page said the film "plays on this page once the Author adds it". After the push, the Author made a 720p
web encode of each film (each under GitHub's 10 MB upload limit) and uploaded the seven as attachments. A
`https://github.com/user-attachments/assets/…` link alone on its line renders as an inline player with sound, so a
reader who follows a link from the PDF watches the film on the page itself, with no download.

Each of the seven landing pages now has its player's link where the placeholder comment was, and the sentence above it
says the film plays below. The full-quality MP4s stay as the `films-v1` release's assets, behind each page's "Download
the film" link. The Author matched each upload to its film by its title card.

| Film | Player |
| --- | --- |
| `cost-meter` | `b26ed39b-a7ce-4b51-b9e8-20eca6a0a565` |
| `data-flows` | `a8a1de1f-62f0-469e-96f0-a2666fbeeb5a` |
| `evals` | `24e54e40-48d0-478d-8650-9c33ba17d5d4` |
| `kill-switch-b2` | `0a3d0a31-741c-49ef-9ea9-e7a9c4631408` |
| `lifecycle` | `8843587c-d3f7-47be-b512-a749f7c01d7d` |
| `local-first` | `cae2d7da-d3d4-403d-b1ea-debb0cf78d15` |
| `stack` | `6886d517-0c0d-4b2f-acb1-287f1d06904e` |

## Acceptance criteria

FR-012, as amended: each landing page offers the film from the release `films-v1` and links no MP4 in the tree;
`apps/web/test/content/film-links.test.ts` case 2 checks it. The resume's four links and the four folder names are
unchanged.

## Constitution check

No code, no data flow from a visitor's device beyond GitHub's own page (the players are GitHub's), no secret.

## Review

None by an agent: seven placeholder lines replaced with the Author's own upload links, as the docs branch's note
planned. The check is the Author's step below.

## Verification

From the worktree: `apps/web/test/content/film-links.test.ts`, 8 passed and 5 skipped; Prettier clean on the note and the seven pages; the docs-link check clean.

## Cost and data-flow impact

None.

## For the Author

1. Your gate on this branch (`pb=docs/films-players`), then the merge, then `git push origin main`.
2. Test the four links from the resume PDF itself, on your desktop and on your phone: each opens its film's page, and
   the film plays there with sound.
