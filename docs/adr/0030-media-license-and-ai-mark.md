# ADR 0030: The assets' media license, and the AI-likeness mark

Status: proposed, 2026-10-18, recording spec 003's clarified answers, taken by recommendation under the Author's direction of 2026-10-17, for the Author to accept; spec 004's Amendment C1 makes the mark follow the record · Spec: 003 (FR-015, FR-034; research R-03, R-11); 004 (FR-023, FR-077; Amendment C1; research R-53)

## Context

Intent 003: "Separate media license". "Code stays MIT. Assets get their own, stricter license (for example, all rights reserved or CC BY-NC-ND), chosen in the spec." And: "The twin stays disclosed as an AI (Principle VIII); a likeness makes that disclosure matter more." Spec 003's clarify session of 2026-10-18 took the recommended option for both questions, by the Author's direction: "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change". The answers, in the spec's words:

- the license: "All rights reserved, with a plain notice that viewing and linking are welcome";
- the disclosure: "Both: a visible line in the twin's disclosure that the avatar is an AI-made, stylized likeness of the Author, published by the Author's choice; and one machine-readable mark in every published image and model file (the IPTC digital source type for AI-generated media), with nothing else in the file".

## Decision

- **The media license** is `all-rights-reserved-2026`: all rights reserved, with viewing and linking welcome. It covers `assets/` and `docs/research/images/`, which the repository's MIT license doesn't. Each asset directory, and each published-image folder, carries the notice in `LICENSE.md` (contracts/asset-record.md §3), whose copyright line the Author fills in before the directory's first file arrives; each record's `media_license` names it; the README's license line names both licenses.
- **The mark** is one XMP packet holding exactly one property, `Iptc4xmpExt:DigitalSourceType`, set to a term of IPTC's vocabulary under `http://cv.iptc.org/newscodes/digitalsourcetype/`, and nothing else: no toolkit attribute, no date, no tool name. The term follows the file's record (spec 004, Amendment C1; the intent's words: "A model I made by hand must not carry an "AI-made" mark. The mark follows the record"):
  - `trainedAlgorithmicMedia` when every step of the record is by a model;
  - `compositeWithTrainedAlgorithmicMedia` when its steps mix a model's and a hand's;
  - IPTC's term for media a person made with digital tools when every step is by hand, the one term the Author confirms at IPTC's vocabulary (spec 004's task T031; the plan's candidate, `digitalCreation`, is unverified).

  A step the studio's agent session scripted is a model step. Under `assets/twin/` and `docs/research/images/`, only `trainedAlgorithmicMedia` passes, whatever the steps say. Wherever a file lives, a record whose steps call for any other term needs the Author's approval of the file's SHA-256 on `main` (rule P1), as a room file's does, so a mistaken record can't claim a hand in a model's file with no human looking (the main session's hardening after spec 004's review, T041; the Author may relax it). A PNG carries it in an `iTXt` chunk keyed `XML:com.adobe.xmp`, a JPEG in an `APP1` segment, a WebP in an `XMP ` chunk, and a GLB as `KHR_xmp_json_ld`'s one packet on the asset; an image embedded in a GLB carries none of its own, since the model file's mark covers it. `scripts/assets/scrub.py` writes it, taking the term from the record with `--record` (`make assets-scrub FILE=<file> RECORD=<records.json>`), and the arrival check refuses a file without it, with anything else in it, or, once spec 004's P-5 is on `main`, with a term its record's steps don't call for (rules M5 and M6).
- **The visible line,** drafted for the Author to approve before the twin's first file: "This avatar is a stylized likeness of the Author, made with AI from the Author's photos and published by the Author's choice." The site shows the Author's first name in place of "the Author" only from a filled `facts/` slot. The Author approves the wording in the twin's first approval (`disclosure_line` in `assets/policy/approvals.json`); until one carries it, the arrival check refuses the twin's files (rule P3).

## Alternatives considered

- **CC BY-NC-ND 4.0:** others could share unmodified copies non-commercially, with credit; but it can't be taken back once published, and Creative Commons doesn't license the likeness itself (the spec's Question 1, option B).
- **A split:** all rights reserved for the likeness, CC BY-NC-ND for the rest: two notices to keep, for little gain before publication (option C).
- **The visible line only, or the mark only:** files with no metadata at all fall short of machine-readable marking if the EU AI Act's Article 50 reaches the site; the mark alone doesn't tell visitors the face is AI-made (the spec's Question 2, options B and C).

## Consequences

- All rights reserved can be loosened later, for the files a new license names; a Creative Commons grant, like MIT, couldn't be taken back.
- Every asset and published image carries exactly one metadata field. The arrival check's allowlist is otherwise what a format needs to render.
- A hand-made or design-sourced room file says so in its mark, and waits for the arrival check's spec 004 amendments on `main` (P-5, which carries Amendments C1 and C2 together), which `make test` holds before the first file under `assets/room/` (spec 004, FR-077).
- The line's wording waits for the Author; so does the twin.

## Links

Intent: `specs/003-studio-assets/intent.md`, `specs/004-room-composition/intent.md`. Spec: `specs/003-studio-assets/spec.md` (Clarifications, FR-015, FR-034); research R-03, R-11; `specs/004-room-composition/` (research R-53; contracts/intake-amendments.md §7, §13). Merge requests: `docs/merge-requests/2026-10-18-feat-003-us1-arrival-check.md`, `docs/merge-requests/2026-10-27-feat-004-intake.md`.
