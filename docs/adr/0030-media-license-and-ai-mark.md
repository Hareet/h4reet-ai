# ADR 0030: The assets' media license, and the AI-likeness mark

Status: proposed, 2026-10-18, recording spec 003's clarified answers, taken by recommendation under the Author's direction of 2026-10-17, for the Author to accept · Spec: 003 (FR-015, FR-034; research R-03, R-11)

## Context

Intent 003: "Separate media license". "Code stays MIT. Assets get their own, stricter license (for example, all rights reserved or CC BY-NC-ND), chosen in the spec." And: "The twin stays disclosed as an AI (Principle VIII); a likeness makes that disclosure matter more." Spec 003's clarify session of 2026-10-18 took the recommended option for both questions, by the Author's direction: "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change". The answers, in the spec's words:

- the license: "All rights reserved, with a plain notice that viewing and linking are welcome";
- the disclosure: "Both: a visible line in the twin's disclosure that the avatar is an AI-made, stylized likeness of the Author, published by the Author's choice; and one machine-readable mark in every published image and model file (the IPTC digital source type for AI-generated media), with nothing else in the file".

## Decision

- **The media license** is `all-rights-reserved-2026`: all rights reserved, with viewing and linking welcome. It covers `assets/` and `docs/research/images/`, which the repository's MIT license doesn't. Each asset directory, and each published-image folder, carries the notice in `LICENSE.md` (contracts/asset-record.md §3), whose copyright line the Author fills in before the directory's first file arrives; each record's `media_license` names it; the README's license line names both licenses.
- **The mark** is one XMP packet holding exactly one property, `Iptc4xmpExt:DigitalSourceType`, set to `http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia`, and nothing else: no toolkit attribute, no date, no tool name. A PNG carries it in an `iTXt` chunk keyed `XML:com.adobe.xmp`, a JPEG in an `APP1` segment, a WebP in an `XMP ` chunk, and a GLB as `KHR_xmp_json_ld`'s one packet on the asset; an image embedded in a GLB carries none of its own, since the model file's mark covers it. `scripts/assets/scrub.py` writes it, and the arrival check refuses a file without it, or with anything else in it (rules M5 and M6).
- **The visible line,** drafted for the Author to approve before the twin's first file: "This avatar is a stylized likeness of the Author, made with AI from the Author's photos and published by the Author's choice." The site shows the Author's first name in place of "the Author" only from a filled `facts/` slot. The Author approves the wording in the twin's first approval (`disclosure_line` in `assets/policy/approvals.json`); until one carries it, the arrival check refuses the twin's files (rule P3).

## Alternatives considered

- **CC BY-NC-ND 4.0:** others could share unmodified copies non-commercially, with credit; but it can't be taken back once published, and Creative Commons doesn't license the likeness itself (the spec's Question 1, option B).
- **A split:** all rights reserved for the likeness, CC BY-NC-ND for the rest: two notices to keep, for little gain before publication (option C).
- **The visible line only, or the mark only:** files with no metadata at all fall short of machine-readable marking if the EU AI Act's Article 50 reaches the site; the mark alone doesn't tell visitors the face is AI-made (the spec's Question 2, options B and C).

## Consequences

- All rights reserved can be loosened later, for the files a new license names; a Creative Commons grant, like MIT, couldn't be taken back.
- Every asset and published image carries exactly one metadata field. The arrival check's allowlist is otherwise what a format needs to render.
- The line's wording waits for the Author; so does the twin.

## Links

Intent: `specs/003-studio-assets/intent.md`. Spec: `specs/003-studio-assets/spec.md` (Clarifications, FR-015, FR-034); research R-03, R-11. Merge request: `docs/merge-requests/2026-10-18-feat-003-us1-arrival-check.md`.
