# feat/002-author-resume-pdf

Spec: [specs/002-the-room/](../../specs/002-the-room/spec.md), its Clarifications' [amendment of 2026-11-09](../../specs/002-the-room/spec.md#amendment-2026-11-09-the-authors-designed-pdf), [plan.md §2](../../specs/002-the-room/plan.md#2-the-resume-source-checks-and-two-renderings-user-story-1-fr-013-to-fr-019-r-05-r-06) ("The Author's PDF"), [contracts/resume-source.md §7](../../specs/002-the-room/contracts/resume-source.md#7-the-authors-designed-pdf), and data-model.md §5 · Intent: none new (intent 002) · Written by: implementer subagent (Claude Opus 5.5), for the main session · Date: 2026-11-09

Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`. This branch's worktree is `/tmp/claude-1000/wt-resume-pdf`, cut with `git worktree add -b` at e324771e and now rebased onto 787d85af, `main`'s tip with `fix/009-avatars-ready` (through f76ead54), the web image's readiness fix, and the Anthropic switch merged, and your A10 fix (e7fa53ed) before them. Repo hooks active: yes. This session's entries in `.claude/audit/hooks.log` that weren't ALLOW:

```text
2026-11-09T20:42:28Z	post-edit	WARN	lint failed :: /tmp/claude-1000/wt-resume-pdf/apps/web/test/content/author-pdf.test.ts
2026-11-09T20:44:23Z	post-edit	WARN	lint failed :: /tmp/claude-1000/wt-resume-pdf/apps/web/src/resume/view.ts
2026-11-09T20:47:20Z	post-edit	WARN	lint failed :: /tmp/claude-1000/wt-resume-pdf/apps/web/build/content.ts
2026-11-09T20:47:21Z	post-edit	WARN	lint failed :: /tmp/claude-1000/wt-resume-pdf/apps/web/build/content.ts
2026-11-09T20:58:30Z	bash	BLOCK	recursive delete outside workspace :: rm -rf <the session's scratchpad>/glpdf <the session's scratchpad>/glrepo
2026-11-09T21:18:37Z	bash	BLOCK	switching to main :: R=$TMPDIR/guardtest; … git init -q -b main … git switch -q main … zsh steps.zsh
2026-11-10T06:40:36Z	bash	BLOCK	changing main (HEAD is main) :: cd /tmp/claude-1000/wt-resume-pdf && python3 -I - <<'EOF' … (an edit of this note)
2026-11-10T06:41:28Z	bash	BLOCK	changing main (HEAD is main) :: cd /tmp/claude-1000/wt-resume-pdf && git add docs/merge-requests/2026-11-09-… && git commit …
```

The four warnings were imports written one edit before their first use; every file passes lint now. The bash gate refused four commands, and in each nothing ran and nothing was respelled:
- deleting two scratch folders that hold copies of your PDF, made for the gitleaks check (Verification). They're in "Cleanup" below;
- a rehearsal of step 4's guard in zsh, on a scratch repository of two empty commits, which the gate read as a switch to main. So step 4 hasn't run here. Its lines are the guard you ran for `fix/007-live-runs-2`, with shorter names, and the ancestor test split over two lines;
- after the rebase, a script editing this note, and then this note's commit, while your checkout of main was on `main` for your live runs. The note's edit was made in the editor instead, with the same words; the commit waited until your checkout was parked.

The two BLOCKs on this worktree at 21:26:06Z and 21:29:55Z ("a read-only role writing a file") came from the reviewer's read-only session, not this one.

Authorized by: your approval of the amendment in the main session on 2026-11-09, recorded verbatim in spec.md's Clarifications, as the main session's brief relayed it; and the main session's review of 9320b778, as it relayed it.

## Status: reviewed once (can merge, with changes requested), the changes made, rebased onto main 787d85af; not reviewed again, not merged; `make check` on this tip waits for the main session's go

| Commit | What |
|---|---|
| 0771df98 | RED: the designed PDF's tests, the download name's, and `resume_pdf` in the smoke test, the review's cases among them |
| 04c984c3 | GREEN: the code, spec.md's amendment, plan.md's departure, the contract's §7, data-model.md, quickstart.md, the web README |
| this commit | this note, and the approval patch beside it, `2026-11-09-feat-002-pdf-approval.patch` |

**The history was rebuilt after the review.** The first version wrote your surname into eight files the agents wrote, 20 times, and into two commit messages, and `tools/gates/publish_check.py` checks every blob in history against your denylist. These three commits replace the reviewed ones (06d511c4, 0a0e3fd7, 39bb8e0a, 9320b778), which no branch or tag reaches any more. The Prettier fix that sat between them (c2011d9c) is gone: `main` carries its own, from `fix/009-avatars-ready`. Now the surname is only in spec.md's two verbatim quotes of your words, where the review kept it. The review's changes were still written test-first: their RED run against the reviewed code is in Verification.

**Three things differ from the option you approved** ("you add the PDF's hash to approvals.json, then gate and merge"):

- **The file is `content-approvals.json`.** The room's build and the gate's content check read content approvals from `assets/policy/content-approvals.json`. Spec 003's `approvals.json` holds the studio's assets, and the room's build never reads it.
- **The hash goes in after the merge, on `main`.** Spec 003's rule A9 refuses a branch that changes `assets/policy/`, at the gate and in the pre-commit check. So the order is: the gate, the merge, then the hash. Until the hash is on `main`, every release build serves the render, and runs PDF1 to PDF9 on your file anyway.
- **A drafts build serves an unapproved file.** On dev's and dev-cpu's `-drafts` images, any version of your PDF that passes PDF1 to PDF9 is served, unpinned, marked only in `room-data.json`. The question you approved said "pinned by its SHA-256 in main's approvals". Prod's image serves only the version `main` approves.

**And one gap, named in plan.md §2 as a departure from ADR 0034:** nothing human-only checks that the PDF `dist/` serves is one `main` approves. `tools/gates/content_check.py` never reads `dist/resume.pdf`, so the build's own code is what keeps an unapproved file out of a release build. The Backlog has the patch that closes it.

**`main`'s failures before this rebase.** Neither came from this branch:

- **`test`** failed on `main` from e324771e, which changed `config/twin-readiness.yaml`, until the merges now on it:
  - `apps/web`: 8 tests in `test/room/chunk.test.ts` and `test/room/dist.test.ts`, which `fix/009-avatars-ready` fixes;
  - pytest: `tools/gates/test/test_arrival_check.py::test_a10_passes_p1s_own_file_whose_comments_show_ready_true`, which your e7fa53ed fixes.

  Both are on `main` now, under this branch. Their runs below are from before the rebase. `make check` on this tip comes when the main session says the machine is free; until then, lint and the PDF's tests are the runs on it (Verification).
- **`lint`** failed on `main`'s four run records, which `main`'s `.prettierignore` now skips.

## Runs in your terminal (ADR 0017)

Every pasted line is 45 characters or fewer. Run them in order, in one terminal, from main's checkout, which is parked on `wip-park/11-9-2026`: later steps use earlier steps' variables. Nothing here is paid, and there is no behavioral tier: the branch touches no agent config.

**0. Your denylist over PDF4's own input** (recommended). The private denylist is gitignored. The gate's container and the images can't read it, and this session can't either, so no automated run applies it to your PDF. This session wrote exactly what PDF4 reads to `/tmp/claude-1000/resume-pdf-pdf4.txt`, with the build's own code (`pdf4Lines`): eight lines, the text, the four link targets, and the three property values. Each line is normalized as C9 reads text (lowercase, quotes straightened, `` ` `` and `*` dropped, white space collapsed), with `main`'s full name and contact taken out, as FR-017 puts them on the PDF. The `sed` reads your denylist the way the build does. The pipeline prints a count, never a phrase, and should print `0`:

```bash
d=corpus/intake/private/denylist.txt
t=/tmp/claude-1000/resume-pdf-pdf4.txt
sha256sum "$t"
sed -e '/^[[:space:]]*#/d' \
  -e 's/[`*]//g' \
  -e "s/‘/'/g" -e "s/’/'/g" \
  -e 's/“/"/g' -e 's/”/"/g' \
  -e 's/[[:space:]]\{1,\}/ /g' \
  -e 's/^ //' -e 's/ $//' \
  -e '/^$/d' "$d" |
  grep -ciFf - "$t"
```

The first line should print `f11f4adb6e0f5a40f14f90699cfe93011b0ffe8bbe7db4925d76601049301bc2`. /tmp is wiped when WSL restarts: if the file is gone, ask the session to write it again. A count above 0 means a phrase is in the PDF where PDF4 reads it. Don't go on; change the PDF, and tell the session.

**1. Your PDF on a branch cut from this tip.** Put the tip the session gives you in place of `PASTE_THE_TIP`. The switch runs only when the branch is still at that tip, and the copy only on the new branch:

```bash
b=feat/002-author-resume-pdf
t=PASTE_THE_TIP
r=$(git rev-parse --verify "refs/heads/$b")
c=content/002-resume-pdf
[ "$r" = "$t" ] && git --no-replace-objects \
  switch -c "$c" "$t"
g=$(git branch --show-current)
echo "on $g"
f=$(ls resume/*-Resume-hareet-ai.pdf)
p=apps/web/content/resume-author.pdf
[ "$g" = "$c" ] && cp "$f" "$p"
sha256sum "$p"
```

`echo` should print `on content/002-resume-pdf`, and the last line `5523e5327a752bc10b92538ce8e016243aa5ea22e4e79c21f439f6b877549d6d`, the file the session checked (Verification). The `ls` matches the file your request names, and not your other resume beside it. If it printed another branch or another hash, stop, and tell the session.

**2. Commit it**, on that branch. Each line runs only there:

```bash
g=$(git branch --show-current)
[ "$g" = "$c" ] && git add "$p"
v="content(002): the Author's PDF"
[ "$g" = "$c" ] && git commit -m "$v"
```

The pre-commit hooks run gitleaks, which found nothing in your PDF here (Verification), and the arrival check, whose A9 doesn't apply: nothing under `assets/policy/` changes.

**3. The gate**, from `main`, without `--prove`. It runs stage E only for `deploy/agents-engine/` or `.claude/settings.json`, and the behavioral tier only for the agent config; this branch touches none of them:

```bash
git --no-replace-objects switch main
log=~/gate-resume-pdf.log
tools/gates/gate "$c" 2>&1 | tee "$log"
```

Expect Ready, with `evals` WARN, the behavioral tier's line about `main`'s recorded run. The session's `make check` on this tip is still to come (Status): if it finds anything, the note says so before you gate. The content build runs PDF1 to PDF9 on your file and serves the render, since `main` doesn't approve it yet. Where the gate shows the build's lines, one says so: "resume: apps/web/content/resume-author.pdf passed PDF1 to PDF9; main doesn't approve it, so the PDF is the render". With any other failure, don't merge; tell the session.

**4. The guard and the merge.** It prints `guard: go`, and merges, only when the gate printed its merge line, your checkout is on `main`, the branch is at the SHA the gate checked, and `main` is an ancestor of that SHA:

```bash
s=$(grep '^gate: ' "$log" | tail -n 1)
x=$(printf '%s\n' "$s" | awk '{print $2}')
o=go
grep -q '^merge: ' "$log" || o=no
h=$(git symbolic-ref -q HEAD)
[ "$h" = refs/heads/main ] || o=no
y=$(git rev-parse --verify "refs/heads/$c")
[ "$y" = "$x" ] || o=no
m=refs/heads/main
git merge-base --is-ancestor "$m" "$x"
[ $? = 0 ] || o=no
echo "guard: $o"
n="Merge $c (${x:0:12})"
a=(--no-replace-objects merge --no-ff)
a+=(-m "$n" -m "$s")
[ "$o" = go ] && git "${a[@]}" "$x"
```

On `guard: no`, nothing merged. Tell the session, which rebases the branch if `main` has moved.

**5. The approval, on `main`.** The patch beside this note adds entry C-0002, of kind `resume`, with your words of today as its reason. `sed` puts the file's own hash in place of the placeholder. First apply it and read it:

```bash
g=$(git branch --show-current)
echo "on $g"
p=apps/web/content/resume-author.pdf
h=$(sha256sum "$p" | cut -c1-64)
echo "$h"
d=docs/merge-requests
q=$d/2026-11-09-feat-002-pdf-approval.patch
e="s/PDF_SHA256/$h/"
[ "$g" = main ] && sed "$e" "$q" |
  git apply -
git diff
```

The first `echo` should print `on main`, and the second step 1's hash; off `main`, nothing is applied. The diff should be one comma after C-0001 and C-0002's three lines, with that hash. Then commit it:

```bash
k=assets/policy/content-approvals.json
[ "$g" = main ] && git add "$k"
w="policy: C-0002, the Author's PDF"
[ "$g" = main ] && git commit -m "$w"
```

The patch was built from a plain copy of `main`'s file (`git show`), and checked twice: it applies to `main`'s file, and both the build and `main`'s `content_check.py` read the result.

**6. Prod on `main`:**

```bash
git symbolic-ref HEAD
make up ENV=prod
```

The first line should print `refs/heads/main`. `web_image.py` reads `main`'s approvals and header again, so the image serves your PDF under your file name.

**7. The download in the room:**

```bash
u=http://127.0.0.1:18005/resume.pdf
curl -s "$u" | sha256sum
curl -sI "$u" | grep -i '^content-\|^cache'
```

The hash should be step 1's; the headers should be `Content-Type: application/pdf` and `Cache-Control: no-cache`. Then open `http://127.0.0.1:18005/` and choose "Download the resume (PDF)". The browser should save the file under the name your request gives, with your design. In the room, the "Resume" panel's "Download (PDF)" and the talk panel's link should save the same file. The panel itself should still show the cited resume.

When you're done, park off `main`:

```bash
w=wip-park/11-9-2026
git --no-replace-objects switch -C "$w"
```

**Cleanup**, after the merge. The bash gate refuses this session's deletes outside the repository, so these are yours. The scratch git repository's objects are read-only, hence `rm -rf`:

```bash
T=/tmp/claude-1000
git worktree remove "$T/wt-resume-pdf"
git branch -d feat/002-author-resume-pdf
git branch -d content/002-resume-pdf
rm "$T/resume-pdf.txt"
rm "$T/resume-pdf-pdf4.txt"
rm -r "$T/export-resume-pdf-served"
rm -r "$T/export-resume-pdf-tip"
rm -r "$T/export-resume-pdf-red"
rm -r "$T/policy-resume-pdf"
rm -r "$T/policy-main-resume-pdf"
rm -r "$T/pdfpatch" "$T/sedcheck-resume"
rm -r "$T/npm-cache-resume"
S=$T/-home-h4reet-h4reet-ai-h4reet-ai
S=$S/8ada6eda-2ede-475e-85f7-41dc48f5ce51
rm -rf "$S/scratchpad/glpdf"
rm -rf "$S/scratchpad/glrepo"
```

The scratchpad's two folders hold copies of your PDF. A WSL restart clears all of `/tmp`.

## What changed and why

| Path | Change |
|---|---|
| `apps/web/build/resume-pdf.ts` (new) | Reads a PDF with pdf.js: its pages, text, link targets, properties, and anything the checks can't read. Holds it to PDF1 to PDF9. `shownOf` and `pdf4Lines` give what PDF4 and PDF8 read. `PDF_LINKS` is the allowlist, each host with the corpus file that names it |
| `apps/web/build/content.ts` | `authorPdfRules` gives the checks C9's list and normalizing; `checkAuthorPdf` runs them. `resumePart` checks your file whenever it's there, failing the build at a problem. It serves your file in the render's place when `main` approves it, or a drafts build shows it, and `main`'s header fills both slots. It writes `resume_pdf`. A link in the file's place is refused |
| `apps/web/build/pdf.ts` | `openPdf` and `documentText`, split out of `pdfText`, which reads as before, so both PDFs' text comes from one reader |
| `apps/web/build/download-name.ts` (new), `vite.config.ts` | The download name from `main`'s `resume-header.json` in the build's policy directory: defined as `__PDF_FILE_NAME__` for the scripts, and written into `index.html`'s link |
| `apps/web/src/resume/download.ts` (new), `src/resume/view.ts`, `src/choice/choice.ts`, `src/talk/talk.ts`, `index.html` | `pdfFileName()` for the choice screen, the talk panel, and the interactive resume; `index.html`'s plain link (a fourth, which had no `download`) holds the fallback, which the build replaces. The path stays `./resume.pdf` |
| `apps/web/test/content/author-pdf.test.ts`, `test/ui/pdf-download.test.ts` (new), `test/smoke.test.ts` | The tests, below |
| `specs/002-the-room/spec.md` | The amendment in Clarifications, with your words; a sentence each in FR-013, FR-014, FR-018, FR-019, and SC-002 pointing to it |
| `specs/002-the-room/plan.md` §2 | "The Author's PDF": the departure, where it differs from the option you approved, the drafts rule, and the departure from ADR 0034 |
| `specs/002-the-room/contracts/resume-source.md` | §7, the designed PDF: when it's served, what's written beside it, PDF1 to PDF9, the allowlist, and the download name. §4's "Links" row and §5's kinds point to it |
| `specs/002-the-room/data-model.md` §5, `quickstart.md` §3, `apps/web/README.md` | `resume_pdf`; a check for you after `make up`; the new files |
| `docs/merge-requests/2026-11-09-feat-002-pdf-approval.patch` | Your approval, for step 5 |

**What the design settled** (spec.md's amendment and the contract's §7 hold it all):

- **The file.** `apps/web/content/resume-author.pdf`: a generic name, so the surname stays out of the tree's paths.
- **The download name.** Derived when the site is built: `main`'s full name, its words joined by hyphens, then "-Resume-hareet-ai.pdf". Under `main`'s header that is exactly the name your request gives, which a test checks against spec.md's quote of your words. While either slot is empty it is "Resume-hareet-ai.pdf", as FR-017 gives the PDF the room's header then. No source file holds it.
- **When it's served.** When `main`'s `content-approvals.json` holds its SHA-256, under any kind, as spec 002's files are approved; the patch writes `resume`. And only when `main`'s `resume-header.json` fills both slots: FR-017 puts the full name and contact on the PDF only then.
- **Drafts.** A `-drafts` build serves it unapproved, marked `draft: true` in `resume_pdf`, since its bytes can't carry the banner (Status).
- **What goes on record.** `resume.pdf.txt` holds its text, so the gate's scan of `dist/` reads it. It's never in `published`, whose entries the gate's content check holds to content files.
- **When the checks run.** On every build that finds the file, served or not. PDF7 and PDF8, and PDF3's full-name test, need `main`'s header, so a build without it (make test's builds, with an empty policy) checks the rest.
- **The caps.** 2 pages and 1,000,000 bytes. Your file is 1 page and 243,644 bytes.
- **The allowlist.** `hareet.ai`, `denverlocal.ai`, and `github.com/Hareet`, from `08`, `07`, and `00`. A test finds each in its file, and holds each entry's words to its host and path. Any subdomain counts; `github.com` counts only as your account.
- **Written URLs** are read with a scheme or `www.`, or as a bare domain with a common top-level domain written lowercase. "Node.js" and "ASP.NET" aren't URLs; "Socket.io" would be, and would fail PDF5.
- **Full name and contact.** PDF4 and PDF8 read every string normalized, with `main`'s full name and contact taken out, so a denylist that holds your surname or address doesn't fail them where the header puts them.
- **Reported by rule.** A problem prints its rule and where it was found (the text, the links, or the properties), never a URL, an address, or a phrase.
- **What the checks can't read** is refused (PDF9): an attachment, JavaScript, a form field, an annotation other than a link, or an XMP stream. PDF3 also refuses text pdf.js couldn't map to characters. Your file has none of them.

## Acceptance criteria

- **FR-018, as amended:** every link saves the PDF under the name your request gives, derived from `main`'s header, and "Resume-hareet-ai.pdf" while a slot is empty, from the same `./resume.pdf`; `pdf-download.test.ts`, a real build under a fixture header among its cases.
- **FR-017:** the designed PDF, and its full-name file name, only while `main`'s header fills both slots; `author-pdf.test.ts`'s "when main's header isn't filled, even approved", and `pdf-download.test.ts`'s WHILE case.
- **contracts/resume-source.md §5's approval by hash, applied to the PDF:** served only when `main` approves its SHA-256, or in a drafts build; otherwise the render, byte for byte as before; `author-pdf.test.ts`'s "the render, unchanged, otherwise".
- **FR-013, FR-014, FR-019, and SC-002, as amended:** they hold for the interactive resume and the render. The designed PDF is held to the "Do not claim" lists by PDF4. The interactive resume is unchanged: `resume_state`, `header`, and `sections` are as before.
- **The amendment's checks, PDF1 to PDF9:** a failing fixture for each, the denylist's reported by its line alone, and PDF9's every kind in a file made by the test; `author-pdf.test.ts`.
- **FR-057:** nothing new loads from another host. The PDF's links are in a document the visitor keeps.

## Constitution check

Against the [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-Local by Default | Yes | No new flow: the PDF is still a static file from the site's own origin (V1). The site loads nothing from the hosts its links name (FR-057). |
| II. Production-Grade or Not Shipped | Yes | RED, then GREEN, for the first version and for the review's changes; `make lint`, `make test`, `make evals`, and `make check`; builds of both paths with `main`'s content check; gitleaks on a fresh export; the merge rehearsal. |
| III. Intent Before Spec, Spec Before Code, Humans Merge | Yes | Your approval is spec.md's amendment, verbatim, with plan.md's departure, in the GREEN commit beside the code. You commit the PDF and the approval, and you merge. |
| IV. Least Privilege for Humans and Agents Alike | Yes | No permission, hook, gate path, or policy file changes. The approval is your patch, applied by you on `main`; no agent commits the PDF. |
| V. Cost Is a First-Class Signal | No | No model call. $0. |
| VI. Build in Public, Including Failures | Yes | This note says where the build departs from the option you approved, the gap ADR 0034 leaves open, that no automated run applies your denylist to the PDF, and which of `main`'s failures reach this branch. |
| VII. Own the Whole Product — and Say Exactly What You Owned | Yes | The designed PDF is your own words, approved by you. PDF4 holds it to every corpus file's "Do not claim" list, and the room's on-screen resume stays the cited one. |
| VIII. Honest AI | No | The twin's corpus, prompt, and words are unchanged; the PDF isn't the twin's. |
| Accessibility (FR-065, WCAG 2.2 AA) | Yes | The links keep their names and roles. Your PDF is tagged (Document, H1, H2, L, LI, Link), `en-US`, with its title displayed, as pdf.js reads it. |

No control the constitution requires is dropped. FR-019's last clause, the properties, holds for the render alone: the designed PDF's are Chromium's, a title, a producer and creator naming it, and two dates. That's the spec's amendment, not a constitution deviation. The departure from ADR 0034 is named in plan.md §2; its fix is a human-only patch (Backlog).

## Review

One review, by the main session, of 9320b778: "the code can merge, with changes requested". What was done:

| Finding | Done |
|---|---|
| **B1, blocker:** step 0 didn't read the text as PDF4 does: the full name and contact stayed in, so a denylist holding the surname counted at least 2; and `grep -F` didn't straighten curly quotes | `pdf4Lines` gives PDF4's exact input; the session wrote it to `resume-pdf-pdf4.txt`, pinned by its hash in step 0. Step 0's `sed` reads the denylist as the build does. It differs from the review's form in its order: comments go first, from the raw line, and trimming and blank lines last. The review's form left a leading space where a line began with a backtick, and an empty pattern, which matches every line, where a line was only `*` or backticks (Verification) |
| **The surname,** in 8 files the agents wrote, 20 times, which `publish_check.py` would flag at publication | The build derives the name from `main`'s header (`build/download-name.ts`), with the fallback while a slot is empty. The tests read it from a fixture header, and check it under `main`'s header against spec.md's quote of your words. The spec's other text, the plan, the contract, the README, the quickstart, the tests, this note, and the commit messages name it generically. The history was rebuilt (Status) |
| **I1:** nothing human-only checks that the served PDF is approved (ADR 0034) | Named in plan.md §2 and the contract's §7; the patch and the lasting step 0 are in the Backlog |
| Nit 1: PDF6 missed "1-303-555-0142" and "1.303.555.0142" | The review's third phone shape; both, and "1 (303) 555-0142", are test cases |
| Nit 2: hidden text | PDF9 refuses an annotation other than a link; PDF3 refuses a replacement, private-use, or control character. Tests for both; your file passes both |
| Nit 3: the contract's "kind `resume`" | "in an entry of any kind (the patch writes `resume`)" |
| Nit 4: the third difference; the title's description | Status names the drafts rule. Verification and For the Author both describe the title as your full name and hareet.ai |
| Nit 5: the cleanup list | Every scratch file and folder, in lines of 45 characters or fewer |
| The allowlist test; the README; PDF9 on real files | The test holds each entry's words to its host and path. The README names `draft: true`. PDF9's JavaScript, XMP, form field, and note are each tested on a file PDFKit makes |

Not reviewed again.

## Verification

All on this worktree unless noted; the note's commit adds two documents.

**On this tip, rebased onto 787d85af** (0771df98 RED and 04c984c3 GREEN, with no conflict). `make -f Makefile lint`, exit 0: ESLint, tsc, "All matched files use Prettier code style!", ruff "All checks passed!", "463 files already formatted", shellcheck clean. Then the PDF's five test files, `npx vitest run test/content/author-pdf.test.ts test/ui/pdf-download.test.ts test/smoke.test.ts test/content/publication.test.ts test/pdf.test.ts`, exit 0:

```text
 Test Files  5 passed (5)
      Tests  72 passed | 1 skipped (73)
```

The approval patch still applies to `main`'s `content-approvals.json`, which 787d85af leaves as it was (`git apply --check`). `make check`, `make test`, `make evals`, gitleaks on an export, and the rehearsal on this tip wait for the main session's go. The rest of this section ran before the rebase, at c2011d9c, whose code matches this tip's: the rebase brought `main`'s changes in under it, and dropped c2011d9c's `.prettierignore` lines for `main`'s own.

The history was rebuilt twice after the review: first as 669809c6, 3c8baf9f, and ef18c7f7, whose `make check` failed `lint` on one line of `author-pdf.test.ts` that an editing script had wrapped and Prettier joins; then, with that line formatted, as d5465d62, f48a8a50, and c2011d9c, which the rebase made 0771df98 and 04c984c3.

**RED, the review's changes**, against the reviewed code (9320b778): `npx vitest run test/content/author-pdf.test.ts test/ui/pdf-download.test.ts`, with the review's cases written in and no code changed:

```text
     × PDF6: a phone number's shape, in the text or a link, and never a year range or a count
     × PDF9: JavaScript, an XMP metadata stream, a form field, or another annotation, each in a file made here
     × PDF3: text pdf.js couldn't map to characters, a replacement, private-use, or control character
     × gives PDF4's input, one normalized line a place, main's full name and contact taken out
 FAIL  test/ui/pdf-download.test.ts [ test/ui/pdf-download.test.ts ]
Error: Cannot find module '../../build/download-name' imported from /tmp/claude-1000/wt-resume-pdf/apps/web/test/ui/pdf-download.test.ts
 FAIL  test/content/author-pdf.test.ts > … > PDF6: … — Error: the build passed
 FAIL  test/content/author-pdf.test.ts > … > PDF9: … — Error: the build passed
 FAIL  test/content/author-pdf.test.ts > … > PDF3: … — AssertionError: "�": expected [] to deeply equal [ Array(1) ]
 FAIL  test/content/author-pdf.test.ts > … > gives PDF4's input, … — TypeError: pdf4Lines is not a function
 Test Files  2 failed (2)
      Tests  4 failed | 23 passed | 1 skipped (28)
```

PDF9's case failed on the note, an annotation other than a link: the reviewed code already caught the JavaScript, the XMP stream, and the form field.

**RED, the rebuilt history**, at d5465d62 (now 0771df98), on a plain export of it (`/tmp/claude-1000/export-resume-pdf-red`, this worktree's `node_modules` linked in): the same three files as the first version's RED. The two new files fail at import, and the smoke test on `resume_pdf`:

```text
 FAIL  test/content/author-pdf.test.ts [ test/content/author-pdf.test.ts ]
Error: Cannot find module '../../build/resume-pdf' imported from /tmp/claude-1000/export-resume-pdf-red/apps/web/test/content/author-pdf.test.ts
 FAIL  test/ui/pdf-download.test.ts [ test/ui/pdf-download.test.ts ]
Error: Cannot find module '../../build/download-name' imported from /tmp/claude-1000/export-resume-pdf-red/apps/web/test/ui/pdf-download.test.ts
 FAIL  test/smoke.test.ts > the built room-data.json > names the policy and the lock it was built with, and lists the drafts it left out
AssertionError: expected { built_from: { …(2) }, …(6) } to deeply equal { built_from: { …(2) }, …(7) }
 Test Files  3 failed (3)
      Tests  1 failed | 16 passed (17)
```

**GREEN**, the two new files with `test/smoke.test.ts`, `test/content/publication.test.ts`, and `test/pdf.test.ts` beside them:

```text
 Test Files  5 passed (5)
      Tests  72 passed | 1 skipped (73)
```

The skipped case reads your PDF from the tree, which holds none until step 2; from step 3 on, the gate's `test` runs it on your file.

**`make -f Makefile lint`**, exit 0 (the shellcheck lines shortened):

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
456 files already formatted
shellcheck -- .claude/git-hooks/pre-commit … tools/gates/secrets.sh   (21 files, no finding)
```

Before the rebase, without c2011d9c, it failed on `main`'s four run records alone: "[warn] Code style issues found in 4 files", `evals/product/history/2026-11-09T175245Z-local.json`, `…191058Z-bedrock.json`, `redteam/history/20261109T175353Z-local.json`, and `…191059Z-bedrock.json`.

**`make test`**, as `make check`'s `test` step ran it, exit 2: it stops at the web workspace, on `main`'s 8 failures (Status):

```text
corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
(gateway)  Test Files  95 passed (95)
           Tests  1652 passed | 13 skipped (1665)
(web)      FAIL  test/room/chunk.test.ts > the release build > the room's bundle (FR-011) > puts the index, `room`, in the entry chunk, within 16,384 bytes at gzip level 9
           FAIL  test/room/chunk.test.ts > the drafts build > the room's bundle (FR-011) > puts the index, `room`, in the entry chunk, within 16,384 bytes at gzip level 9
           FAIL  test/room/chunk.test.ts > the release build > the room's bundle (FR-011) > puts the 3D part only behind the entry's dynamic import, beside the scene module, the digest with it
           FAIL  test/room/chunk.test.ts > the release build > room-manifest.json (Amendment B7) > is compose()'s manifest, its build_kind "release"
           FAIL  test/room/chunk.test.ts > the drafts build > room-manifest.json (Amendment B7) > is compose()'s manifest, its build_kind "drafts"
           FAIL  test/room/chunk.test.ts > the drafts build > the room's bundle (FR-011) > puts the 3D part only behind the entry's dynamic import, beside the scene module, the digest with it
           FAIL  test/room/dist.test.ts > the site's release build (contracts/room-bundle.md §14) > holds no † field's value and no pending line of the committed data, in any file
           FAIL  test/room/dist.test.ts > the site's drafts build (contracts/room-bundle.md §14) > holds no † field's value and no pending line of the committed data, in any file
           Test Files  2 failed | 107 passed (109)
           Tests  8 failed | 2720 passed | 1 skipped (2729)
```

The manifest's diff is `"ready": false` expected, `"ready": true` received, for the objects. The same 8 failed in the first version's run, and on `main`'s own code (the first version's RED commit): "Test Files 2 failed (2); Tests 8 failed | 18 passed (26)". make's pytest never runs after them, so it ran on its own, with make's arguments:

```text
FAILED tools/gates/test/test_arrival_check.py::test_a10_passes_p1s_own_file_whose_comments_show_ready_true
1 failed, 4094 passed in 352.51s (0:05:52)
```

That test's assertion is "A10 config/twin-readiness.yaml @6cbf0e3: the branch marks the twin ready, which only the Author does, on main (spec 007 FR-029)": the readiness file e324771e changed.

**`make -f Makefile evals`**, exit 0, with this note in the tree: "evals product (fake): 187 passed, 0 failed", "evals narration (fake): 44 passed, 0 failed", 18 topic lines at 100%, "agent-config static: 0 failed, 0 planned", and "docs links: 0 failed, 1840 relative links in 259 files". The behavioral tier's line is information here, `main`'s recorded run: "WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch".

**`make -f Makefile check ENGINE_MODE=none-yet`**, with `node_modules` from `npm ci --cache "$TMPDIR/npm-cache-resume"`:

```text
PASS     makefiles-check
PASS     githooks-check
PASS     toolchain-check
PASS     policy
PASS     validate-config
PASS     lint
FAIL     test
PASS     content-check
PASS     secrets
PASS     arrival
WARN     evals  WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, … (as above)
PASS     redteam
FAIL     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 10 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 2 FAIL; failing: test FAIL, matrix FAIL
```

- `test`: the 8 web failures above.
- `content-check`: "content check: PASS (48 content files: 1 approved by main, 47 drafts, none of whose text is in dist/)".
- `secrets`: "PASS 3 commits since main (8adb4abb98a2..HEAD)".
- `arrival`: "arrival-check: 0 findings in 54 files (3 commits)".
- `redteam`: "redteam: 68 passed, 0 failed".
- `toolchain-check`: "all 15 match their pins, 1 newer than its floor (claude code)": 2.1.321 against 2.1.296.
- `matrix`: "REQUIRED matrix-required every listed row ran", and "forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps". The two are stage E's E10 and E14, folded from the host's prove report of a5eb05b8, environmental: E10 "not enough free space to seed: need 22 GiB on both the Windows drive and ext4", and E14 "the sandbox cannot reach them (stage S)".

**Step 0's reading,** checked three ways:

- **The `sed` against C9's own reading.** Over a twelve-line denylist of the hard cases, `sed` (lowercased, as `grep -i` compares) and `forbiddenList`'s phrases are identical, line for line. The cases: comments, indented comments, blank and white-space lines, runs of spaces and tabs, curly quotes, backticks and asterisks, a line of `**` alone, a line beginning with a backtick, and `` `# not a comment` ``. The review's order differed on two of them: " leading tick", with a space, and an empty pattern.
- **The pipeline, in zsh, on `resume-pdf-pdf4.txt`:**
  - a denylist of your surname, your contact in capitals, and your full name: `0`;
  - one word of the text written with a curly apostrophe: `1`;
  - "Hareet.AI": `4`.
- **The file itself:** 8 lines, with no surname, no `@`, and no curly quote in them.

**Your PDF, the served path, end to end**, on a plain export (`/tmp/claude-1000/export-resume-pdf-served`), first of the reviewed code (9320b778), then of ef18c7f7's (c2011d9c's but for that test line), each with:

- your file copied in as `apps/web/content/resume-author.pdf`;
- `main`'s `resume-header.json` and `caps.json`;
- `main`'s `content-approvals.json` with step 5's patch applied, the placeholder replaced by the file's hash;
- the gate's build command, `npm run --ignore-scripts build -w apps/web`, with `ROOM_DRAFTS` empty.

```text
resume: C1–C9 passed; the private denylist is missing here, so C9 checked the public list only
resume: the PDF is apps/web/content/resume-author.pdf, which main approves (PDF1 to PDF9 passed; the private denylist is missing here, so PDF4 checked the public list only)
5523e5327a752bc10b92538ce8e016243aa5ea22e4e79c21f439f6b877549d6d  apps/web/dist/resume.pdf
resume_pdf {'source': 'apps/web/content/resume-author.pdf', 'sha256': '5523e5327a752bc10b92538ce8e016243aa5ea22e4e79c21f439f6b877549d6d'}
published [{'path': 'apps/web/content/resume.yaml', 'sha256': 'e77c72127e84da60ead201997fa3d77348463a297e350f46f0abfe8b63bd80fb'}]
content check: PASS (48 content files: 1 approved by main, 47 drafts, none of whose text is in dist/)
```

The content check is `main`'s `tools/gates/content_check.py`. It ran with that policy folder, and again with `--repo` on `main` itself; both passed. So your PDF's text in `resume.pdf.txt` holds no fragment of the 47 drafts. Under `main`'s three policy files as they are, the same build said "resume: apps/web/content/resume-author.pdf passed PDF1 to PDF9; main doesn't approve it, so the PDF is the render …", `resume_pdf` was `None`, and the content check passed. On ef18c7f7's code (c2011d9c's but for that test line), the approved build gave the same two `resume:` lines, the same hash and `resume_pdf`, and the content check passed again. Its `index.html` link's `download` name equals, character for character, the file name in spec.md's quote of your words; one script holds the same name, and none holds `__PDF_FILE_NAME__`.

**PDF1 to PDF9 on your file,** with the review's rules, through the build's own `pdfProblems` from a scratch script: `[]` under `main`'s header and `[]` without it, the private denylist "missing" in this session. What pdf.js reads of it:

- 1 page, 243,644 bytes;
- 3,021 characters of text, every glyph mapped;
- four link annotations and no other: `mailto:` your contact, `https://github.com/Hareet`, and `https://hareet.ai/` twice;
- its properties: Title (your full name and hareet.ai), Creator (Chromium), and Producer (Skia/PDF m148);
- `en-US`, tagged, DisplayDocTitle on;
- no XMP, attachment, form, or JavaScript.

**gitleaks** (v8.30.1, the main tree's `.gitleaks.toml`):

- on a scratch folder with a copy of your PDF: "no leaks found" (it skips the binary);
- on a scratch repository holding it, `gitleaks git --log-opts="--all --text"`, as the publish check reads history: "scanned ~243644 bytes … no leaks found";
- on a plain export of this branch's tree as first committed with this note, 37dfb173 (`git archive` into `/tmp/claude-1000/export-resume-pdf-tip`), with an empty ignore path and `--ignore-gitleaks-allow`: "scanned ~40283241 bytes (40.28 MB) … no leaks found". The commit was then amended to write this line, which is all that differs.

**The merge rehearsal**, before the rebase, into `refs/heads/main` with `git merge-tree --write-tree`, which writes no worktree. Into 8adb4abb, then this branch's base, the merged tree was c2011d9c's own, since `main` was an ancestor. Into e7fa53ed, `main` then: exit 0, no conflict, and the merged tree (2417d313) differed from c2011d9c's (bc5f43cd) in `tools/gates/test/test_arrival_check.py` alone, your A10 fix. Now `main`, 787d85af, is this tip's base, so the merge writes the tip's own tree; the rehearsal on this tip waits with `make check`.

**Git keeps your PDF's bytes:** `git hash-object --path=apps/web/content/resume-author.pdf` equals `--no-filters` (7c2c1f07): git reads it as binary, so `.gitattributes`' `text=auto eol=lf` leaves it alone, and the committed file hashes as step 1 says.

**A privacy scan** of the branch: `git grep -i` for the surname finds it, outside `assets/policy/`, only in spec.md's two quotes of your words; the four commit messages hold none. The only email addresses added are the tests' `example.org` and `example.net` fixtures, and the only phone shapes the tests' fictional ones (555-01xx, and the UK's drama range).

## Cost and data-flow impact

None. No model call, no new endpoint, no new event, and no new byte leaving a visitor's device. The PDF is still a static file from the site's own origin (V1), and following its link is still `pdf_downloaded` (V4). Its links name hosts the corpus names; the site loads nothing from them (FR-057). A visitor who follows one does so from a document they keep, so `docs/data-flow-disclosure.md` is unchanged. $0.

## For the Author

1. **The order:** steps 0 to 7. Step 5, the approval, comes after the merge, on `main` (Status).
2. **`main`'s red `test`** (Status) is fixed on `main` by the merges under this branch. The session's `make check` on this tip comes first, and the session gives you the tip for step 1 with it.
3. **The denylist gap:** no automated run applies your private denylist to the PDF. Step 0 is the check for this file. Any later edit to the PDF needs step 0 again (ask the session for a new `resume-pdf-pdf4.txt`), a new hash, and a new approval.
4. **Your surname in history:** this branch holds it only in spec.md's two quotes of your words. `assets/policy/resume-header.json` already holds it, and your PDF, once committed, holds your name too, as glyph codes and properties (`publish_check.py` reads blobs as text, so it may or may not see it there). The reviewed commits that held it more widely are unreachable; `git gc` drops them once your reflog lets go of them.
5. **Your PDF's properties** are Chromium's: its title, your full name and hareet.ai; the producer and creator; and the export's two dates (2026-10-29). The amendment allows them (FR-019 as amended). A PDF export without them would need another tool.

## Backlog

- **ADR 0034's gap, a patch to `tools/gates/content_check.py` (human-only):** when `dist/resume.pdf`'s bytes equal the tree's `apps/web/content/resume-author.pdf`, `main` must approve that file's SHA-256, read from `main`'s approvals as the check reads them today, never from `room-data.json` or any of the build's bookkeeping. With it, an unapproved designed PDF in a release build fails the gate whatever the build's code says.
- **Step 0's lasting form:** the build writes `pdf4Lines` to a file beside `resume.pdf.txt` in `dist/`, which the image drops as it drops `*.pdf.txt`, and the gate, which can read your denylist, counts its phrases in that file, printing a count, never a phrase. Then every gate checks the served PDF against your denylist, and step 0 goes.
- The checks read the PDF's text as pdf.js extracts it. Text drawn as outlines, or set without a ToUnicode map, would read as nothing or as other characters. PDF3's full-name test and its unmapped-character test catch most of that, not all.
- PDF5's top-level-domain list is fixed in the code. A bare domain under another one, or written in capitals, isn't read as a URL; a link annotation always is.
- A drafts build serves an unapproved PDF without the banner, and pins none. Only `room-data.json` says it's a draft.
