# Probe: the resume PDF's film links (spec 028, the Author's review item 3)

Task `probe-pdf-028`, night 2026-11-15, implementer role. No code changed. This file is the probe's only output.

## His words

His review of main, 2026-11-15, item 3, word for word:

> 3) When I view the resume and download the PDF, the downloaded PDF doesn't have links to the films where the category text is listed in the sub headlines.

The supervisor's reading of it (item 2 of the night's brief, word for word):

> item 3's PDF: the published resume is still the old one; the one with film links is `apps/web/content/candidates/resume-author-links.pdf`, published by his hand (human patch 023, P8). Spec 028 checks whether its four link annotations sit on the category sub-headlines he means; if not, the fix is spec 028's.

## Answer, short

- **What main serves:** `apps/web/content/resume-author.pdf`, SHA-256 `5523e5327a752bc10b92538ce8e016243aa5ea22e4e79c21f439f6b877549d6d` (C-0002), 243,644 bytes. The build writes it as `resume.pdf`, and the browser saves it as `Resume-hareet-ai.pdf`. It has **no** film links, only its four original ones (mail, GitHub profile, and hareet.ai twice). That explains what he saw: his `make up ENV=prod` built main, and main serves this file.
- **The candidate** (`apps/web/content/candidates/resume-author-links.pdf`, SHA-256 `5de0e7eeaed34587d4d79e29f0cbfb7c577a224ce31616f1d75fcbe4e0ff21fb`, 245,437 bytes) has those four links, plus four film links appended by spec 023's writer.
- **Do the four annotations sit on the sub-headlines he means? Yes, on my reading.** Each one covers exactly one of the four small-caps category items on the line under the "hareet.ai" title (LOCAL MODELS FIRST · A REAL-TIME COST METER · A $5-A-DAY KILL SWITCH · EVERY DATA FLOW DISCLOSED). Each rectangle holds that item's glyphs and no others. These are the only words on the page that any film in `films/` is about (below). The doubt that is left, whether this line is the one he means, goes on the page as a question (below).
- **Fix for spec 028's tasks:** no change to the PDF, to its generator (`apps/web/build/film-links.ts`), or to its table (`films/resume-links.json`). The missing step is publishing, P8 (`docs/merge-requests/human-patches/023.md`): his `git mv` of the candidate onto `apps/web/content/resume-author.pdf` and his C-0005 entry in `assets/policy/content-approvals.json`: his in the morning, now, not after the repository is public; before the entry, `sha256sum` and `pdfinfo -url` on the candidate, and the four clicks on the day the repository goes public. His answer (the night-3 page's Q2, his orders' rule 14), verbatim: "q2) I mean't when i downloaded the pdf, there was no link on those sub headlines "LOCAL MODELS FIRST". I figured that would have existed as we know what the link on the repo will be." (Corrected by `docfix-028`, rv-probes-028's PDF-I1: first written "after the repository is public and he has clicked each link"; the check and the clicks' day are the page's Q26, its recommended answer taken provisionally under his rule 1, no `Answered:` line yet; `human-patches/023.md` now says the same.) Publishing stays his. Spec 028 should hold no code task for item 3. At most it needs a note in its stack note pointing him to P8 and to the question below.
- **Route (b), dropped** (`docfix-028`, rv-probes-028's PDF-I1): this line first gave spec 023's route (b), his re-render, for the case "he means a different line, or more links". His answer above names the row ("LOCAL MODELS FIRST"), so route (b) isn't taken.

## 1. Which PDF the site's download serves on main

The link (`apps/web/index.html:17`):

```text
$ grep -n -i "\.pdf" apps/web/index.html
17:        <li><a href="./resume.pdf" download="Resume-hareet-ai.pdf">Download the resume (PDF)</a></li>
```

The build (`apps/web/build/content.ts`, `resumePart` and `authorPdf`, lines 966–1038) emits the Author's file as `resume.pdf` when two things hold: main approves its SHA-256, and `assets/policy/resume-header.json` fills both header slots. Otherwise it emits the render. `AUTHOR_PDF_PATH` is the served path:

```text
$ grep -n "AUTHOR_PDF_PATH =" apps/web/build/resume-pdf.ts
26:export const AUTHOR_PDF_PATH = "apps/web/content/resume-author.pdf";
```

Main's approvals (`assets/policy/content-approvals.json`, excerpt, unchanged):

```text
    {"id": "C-0002", "path_when_approved": "apps/web/content/resume-author.pdf", "kind": "resume",
     "sha256": "5523e5327a752bc10b92538ce8e016243aa5ea22e4e79c21f439f6b877549d6d",
     "date": "2026-11-09", "reason": "I also want the downloaded resume to be the one that we built"},
```

There is no entry for `5de0e7ee…` (C-0001 to C-0004 only; C-0003 and C-0004 are room-text). The header's slots, printed as booleans so no value is copied here:

```text
$ python3 -I -c 'import json,sys;h=json.load(open(sys.argv[1]));print({k:(bool(v) if k in("full_name","contact") else v) for k,v in h.items()})' assets/policy/resume-header.json
{'schema': 1, 'full_name': True, 'contact': True}
```

The two files' hashes and sizes, and the candidate's prefix:

```text
$ sha256sum apps/web/content/resume-author.pdf apps/web/content/candidates/resume-author-links.pdf
5523e5327a752bc10b92538ce8e016243aa5ea22e4e79c21f439f6b877549d6d  apps/web/content/resume-author.pdf
5de0e7eeaed34587d4d79e29f0cbfb7c577a224ce31616f1d75fcbe4e0ff21fb  apps/web/content/candidates/resume-author-links.pdf
$ ls -l apps/web/content/resume-author.pdf apps/web/content/candidates/resume-author-links.pdf
-rw-r--r-- 1 dev dev 245437 Nov 15 07:48 apps/web/content/candidates/resume-author-links.pdf
-rw-r--r-- 1 dev dev 243644 Nov 15 07:48 apps/web/content/resume-author.pdf
$ cmp -n 243644 apps/web/content/resume-author.pdf apps/web/content/candidates/resume-author-links.pdf && echo "prefix: identical (243644 bytes)"
prefix: identical (243644 bytes)
```

**Served on main:** `apps/web/content/resume-author.pdf`, SHA-256 `5523e5327a752bc10b92538ce8e016243aa5ea22e4e79c21f439f6b877549d6d` (C-0002). I read this from the code and the policy. I did not run a build: this worktree has no `node_modules`, and installing one would mean using the network.

## 2. The candidate's link annotations

### Tools

The container has no poppler (`pdfinfo`, `pdftotext`), no mutool or qpdf, no Python PDF library, and no `pdfjs-dist`, because this worktree has no `node_modules`:

```text
$ for t in pdfinfo pdftotext pdftohtml mutool qpdf pdftoppm; do command -v $t || echo "no $t"; done
no pdfinfo
no pdftotext
no pdftohtml
no mutool
no qpdf
no pdftoppm
$ python3 -I -c 'import importlib.util as u;print([m for m in ["fitz","pypdf","PyPDF2","pdfminer","pdfplumber"] if u.find_spec(m)])'
[]
```

So I read the file in two ways. First, the appended update section as raw text (spec 023's writer appends it uncompressed). Second, a stdlib-only Python reader I wrote for this probe, kept outside the repository in `/tmp/probe-pdf-028-tools/pdfprobe.py` and run with `python3 -I`. It follows the classic xref and its `/Prev` chain, inflates the content stream, maps glyph codes through each font's `/ToUnicode` CMap, and tracks `cm`/`Tm`/`Td` for positions. It installs nothing.

### The appended section (raw)

```text
$ tail -c +243645 apps/web/content/candidates/resume-author-links.pdf
2 0 obj
<</Type /Page
/Resources <</ProcSet [/PDF /Text /ImageB /ImageC /ImageI]
/ExtGState <</G3 3 0 R>>
/Font <</F4 4 0 R
/F5 5 0 R
/F6 6 0 R
/F7 7 0 R
/F8 8 0 R
/F9 9 0 R
/F10 10 0 R
/F11 11 0 R
/F12 12 0 R
/F13 13 0 R
/F14 14 0 R
/F15 15 0 R
/F16 16 0 R
/F17 17 0 R
/F18 18 0 R
/F19 19 0 R>>>>
/MediaBox [0 0 612 792]
/Annots [20 0 R 21 0 R 22 0 R 23 0 R 539 0 R 540 0 R 541 0 R 542 0 R]
/Contents 24 0 R
/StructParents 0
/Tabs /S
/Parent 25 0 R>>
endobj
539 0 obj
<</Type /Annot
/Subtype /Link
/F 4
/Border [0 0 0]
/Rect [64.814 578.89 154.337 586.782]
/QuadPoints [64.814 586.782 154.337 586.782 64.814 578.89 154.337 578.89]
/A <</Type /Action
/S /URI
/URI (https://github.com/hareet/h4reet-ai/tree/main/films/local-first)>>>>
endobj
540 0 obj
<</Type /Annot
/Subtype /Link
/F 4
/Border [0 0 0]
/Rect [173.541 578.89 282.736 586.782]
/QuadPoints [173.541 586.782 282.736 586.782 173.541 578.89 282.736 578.89]
/A <</Type /Action
/S /URI
/URI (https://github.com/hareet/h4reet-ai/tree/main/films/cost-meter)>>>>
endobj
541 0 obj
<</Type /Annot
/Subtype /Link
/F 4
/Border [0 0 0]
/Rect [302.054 578.89 406.276 586.782]
/QuadPoints [302.054 586.782 406.276 586.782 302.054 578.89 406.276 578.89]
/A <</Type /Action
/S /URI
/URI (https://github.com/hareet/h4reet-ai/tree/main/films/kill-switch-b2)>>>>
endobj
542 0 obj
<</Type /Annot
/Subtype /Link
/F 4
/Border [0 0 0]
/Rect [425.369 578.89 552.15 586.782]
/QuadPoints [425.369 586.782 552.15 586.782 425.369 578.89 552.15 578.89]
/A <</Type /Action
/S /URI
/URI (https://github.com/hareet/h4reet-ai/tree/main/films/data-flows)>>>>
endobj
xref
2 1
0000243644 00000 n 
539 4
0000244103 00000 n 
0000244385 00000 n 
0000244669 00000 n 
0000244957 00000 n 
trailer
<</Size 543
/Root 142 0 R
/Info 1 0 R
/Prev 232782>>
startxref
245238
%%EOF
```

### Every link annotation (page, rectangle, target)

The page is 612 × 792 pt (`/MediaBox [0 0 612 792]`). The candidate has one page.

```text
$ python3 -I pdfprobe.py resume-author-links.pdf annots
page 1  obj 20  Rect [369.874, 727.383, 490.194, 739.267]  mailto:hareet.sandhu@gmail.com
page 1  obj 21  Rect [490.194, 727.383, 565.951, 739.267]  https://github.com/Hareet
page 1  obj 22  Rect [199.049, 630.83, 361.704, 701.388]  https://hareet.ai/
page 1  obj 23  Rect [361.704, 630.83, 418.893, 701.388]  https://hareet.ai/
page 1  obj 539  Rect [64.814, 578.89, 154.337, 586.782]  https://github.com/hareet/h4reet-ai/tree/main/films/local-first
page 1  obj 540  Rect [173.541, 578.89, 282.736, 586.782]  https://github.com/hareet/h4reet-ai/tree/main/films/cost-meter
page 1  obj 541  Rect [302.054, 578.89, 406.276, 586.782]  https://github.com/hareet/h4reet-ai/tree/main/films/kill-switch-b2
page 1  obj 542  Rect [425.369, 578.89, 552.15, 586.782]  https://github.com/hareet/h4reet-ai/tree/main/films/data-flows
```

The served file (C-0002), for comparison: the same four first links, and no film links.

```text
$ python3 -I pdfprobe.py resume-author.pdf annots
page 1  obj 20  Rect [369.874, 727.383, 490.194, 739.267]  mailto:hareet.sandhu@gmail.com
page 1  obj 21  Rect [490.194, 727.383, 565.951, 739.267]  https://github.com/Hareet
page 1  obj 22  Rect [199.049, 630.83, 361.704, 701.388]  https://hareet.ai/
page 1  obj 23  Rect [361.704, 630.83, 418.893, 701.388]  https://hareet.ai/
```

### The text under each rectangle

This lists every text run whose origin falls inside the rectangle (±0.5 pt). Chrome writes the letter-spaced small caps one glyph per run, so the runs show as single letters.

```text
$ python3 -I pdfprobe.py resume-author-links.pdf under
page 1 obj 20 -> mailto:hareet.sandhu@gmail.com
    under: h | a | r | e | e | t | . | s | a | n | d | h | u | @ | g | m | a | i | l | . | c | o | m | g
page 1 obj 21 -> https://github.com/Hareet
    under: g | i | t | h | u | b | . | c | o | m | / | H | a | r | e | e | t
page 1 obj 22 -> https://hareet.ai/
    under: h | a | r | e | e | t | .
page 1 obj 23 -> https://hareet.ai/
    under: . | a | i
page 1 obj 539 -> https://github.com/hareet/h4reet-ai/tree/main/films/local-first
    under: L | O | C | A | L | M | O | D | E | L | S | F | I | R | S | T
page 1 obj 540 -> https://github.com/hareet/h4reet-ai/tree/main/films/cost-meter
    under: A | R | E | A | L | - | T | I | M | E | C | O | S | T | M | E | T | E | R
page 1 obj 541 -> https://github.com/hareet/h4reet-ai/tree/main/films/kill-switch-b2
    under: A | $ | 5 | - | A | - | D | A | Y | K | I | L | L | S | W | I | T | C | H
page 1 obj 542 -> https://github.com/hareet/h4reet-ai/tree/main/films/data-flows
    under: E | V | E | R | Y | D | A | T | A | F | L | O | W | D | I | S | C | L | O | S | E | D
```

The trailing `g` under obj 20 comes from the probe's ±0.5 pt margin: obj 20 and obj 21 share the edge x = 490.194, so the first glyph of "github.com" falls inside both. The PDF itself is fine. Each film rectangle holds its own claim's glyphs and nothing from the claims beside it. They are separated by gaps of about 19 pt (154.3 → 173.5, 282.7 → 302.1, 406.3 → 425.4), between the claims; the decoded text holds no separator glyphs there, as the `under:` lines show (corrected by `docfix-028`, PDF-N1: first written "where the separators sit").

### The page's lines, with positions and sizes

This lists every visual line, top to bottom: baseline y, the x of its first and last run, its font sizes in pt, and its text. My script joins glyph runs into words with a gap heuristic, so kerned words show stray spaces ("A pplied"). That is the script's display, not the PDF's text. The fonts' `/BaseFont` names show as `?` because the script doesn't read Type0 descendants; the sizes are enough to rank the headings.

```text
$ python3 -I pdfprobe.py resume-author-links.pdf lines
p1 y= 731.10 x=  52.28.. 562.69  [?@25.7426, ?@8.6601]  H areet Sandhu D enver,C O hareet.sandhu@ gm ail.com github.com /H areet
p1 y= 706.60 x=  52.28.. 465.97  [?@11.3859]  A pplied A IE n gin eerin g L ead,w ith a backgrou n d in site reliability en gin eerin g
p1 y= 652.40 x= 198.86.. 403.93  [?@55.4514]  hareet.ai
p1 y= 616.70 x= 105.45.. 508.75  [?@11.8835]  C om e talk to m y A I tw in ab ou tm y w ork an d m y life.It’s b u iltin th e op en ,
p1 y= 599.60 x= 103.23.. 510.98  [?@11.8835]  so you can see h ow I b u ild A I th atis secu re,cost-effective,an d ob servab le.
p1 y= 580.30 x=  64.81.. 547.06  [?@7.17466]  L O C A L M O D E L S F IR S T A R E A L -T IM E C O S T M E T E R A $ 5 -A -D A Y K IL L S W IT C H E V E R Y D A T A F L O W D IS C L O S E D
p1 y= 552.80 x=  52.28.. 560.46  [?@10.3981, ?@14.8544, ?@8.6601]  M edic A pplied A IE ngineering Lead,previously SR E Lead Jul2018 – N ov 2026
p1 y= 535.80 x=  52.28.. 556.59  [?@8.91262]  Th e n on profitbeh in d th e open -sou rce C om m u n ity H ealth T oolkit(C H T ),u sed in 24 cou n tries.Six govern m en tsru n th eir
p1 y= 523.90 x=  52.28.. 390.22  [?@8.91262]  n ation alcom m u n ity h ealth system son it,in clu din g K enya’san d U gan da’seC H IS.
p1 y= 496.40 x=  52.28.. 561.21  [?@7.67228, ?@9.65534]  M edic’sA Istrategy designed and led
p1 y= 480.80 x=  52.28.. 543.96  [?@8.91262]  O ver th e lasttw o years,Idesign ed th e strategy w ith ou r C E O ,arou n d th e tw o tracksbelow ,an d led itsim plem en tation .
p1 y= 458.50 x=  67.13.. 300.09  [?@10.3981, ?@8.1699]  B uildtim e A I around the C H T,for the people w ho build on it
p1 y= 441.40 x=  67.13.. 562.69  [?@7.67228, ?@9.65534]  cht-agent designed,architected,built
p1 y= 425.80 x=  67.13.. 479.34  [?@8.91262]  A m u lti-agen tsystem in produ ction for ch t-core an d ch t-con f,w ith h u m an validation ch eckpoin ts.
p1 y= 411.00 x=  67.13.. 562.69  [?@7.67228, ?@9.65534]  A gentic data layer built
p1 y= 395.40 x=  67.13.. 557.33  [?@8.91262]  C H T D ocsan d C ode C on textM C P servers,plu scu stom -cu rated agen t-m em ory ofallC H T dom ain sth atkeepslearn in g.
p1 y= 380.50 x=  67.13.. 151.80  [?@9.65534]  O n-callagentsquad
p1 y= 364.20 x= 549.32.. 562.69  [?@7.67228]  built
p1 y= 362.00 x=  78.76.. 513.25  [?@8.91262, ?@9.15772]  agent-w atchdog M on itorsallC H T projects,u pdatesth e team an d letsth em in teractw ith it,su m m arizes
p1 y= 348.60 x=  78.76.. 514.00  [?@8.91262]  alertsfor partn ers,an d bu ildsa kn ow ledge base on correlated alertsan d u ser feedback.Ith assecu re,read-
p1 y= 336.00 x=  78.76.. 228.05  [?@8.91262]  on ly accessto n on -sen sitive m etrics.
p1 y= 321.90 x= 532.98.. 561.21  [?@7.67228]  designed
p1 y= 319.60 x=  78.76.. 511.77  [?@8.91262, ?@9.15772]  claude-m edic-aw s Secu rity-first,read-on ly in frastru ctu re agen t.Itcon tain sou r bestD evO pspractices,
p1 y= 306.30 x=  78.76.. 344.66  [?@8.91262]  to h elp ou r n on -tech n icalpartn ersdedu ce in frastru ctu re issu es.
p1 y= 292.20 x= 526.30.. 561.21  [?@7.67228]  configured
p1 y= 289.90 x=  78.76.. 488.00  [?@8.91262, ?@9.15772]  A gent orchestrator A su pervisor over both agen ts,for kn ow ledgeable su m m ariesofallprojectan d
p1 y= 276.60 x=  78.76.. 436.75  [?@8.91262]  in frastru ctu re in ciden ts:on dem an d,rou tin ely,an d ready to serve to ou r com m u n ity.
p1 y= 259.50 x=  67.13.. 561.21  [?@7.67228, ?@9.65534]  N o-Code CH T Configuration designed,architected
p1 y= 244.60 x=  67.13.. 540.25  [?@8.91262]  M akin g C H T ’stech n icalcon figu ration u sable by n on -tech n icalu sers.Idesign ed th e goal,bu iltou tth e com m u n ity
p1 y= 232.00 x=  67.13.. 521.68  [?@8.91262]  team ,m an aged stakeh older perspectives,an d arch itected th e A Isystem s.A W S 2026 B reakin g B arriersfin alist;
p1 y= 219.40 x=  67.13.. 210.48  [?@8.91262]  A W S IM A G IN E G ran t2026 fin alist.
p1 y= 194.10 x=  67.13.. 249.59  [?@10.3981, ?@8.1699]  R untim e A I inside the C H T,for health w orkers
p1 y= 177.00 x=  67.13.. 561.21  [?@7.67228, ?@9.65534]  Voice forCH T designed
p1 y= 161.40 x=  67.13.. 561.79  [?@8.91262]  Th e h ealth w orker speaksth e visitan d th e form fillsitself,offlin e.Idesign ed th e idea,fou n d th e team ,h elped th em fin e-
p1 y= 148.80 x=  67.13.. 468.95  [?@8.91262]  tu n e m odelsto 273 M B to ru n beside th e app on ru ral4 G B A n droid ph on es,an d bu iltM edic’sside.
p1 y= 134.00 x=  67.13.. 561.21  [?@7.67228, ?@9.65534]  Sm artTask Prioritization designed,architected
p1 y= 118.40 x=  67.13.. 550.64  [?@8.91262]  Idesign ed an d arch itected G PS-based task prioritization for h ealth w orkers,an d arch itected th e A Isystem sth atcarry
p1 y= 105.70 x=  67.13.. 437.75  [?@8.91262]  itscon figu ration acrossth e platform to every project.A W S IM A G IN E G ran t2025 w in n er.
p1 y=  79.70 x=  52.28.. 561.21  [?@7.67228, ?@9.65534]  SR E Lead 2018–2024
p1 y=  64.90 x=  52.28.. 535.05  [?@8.91262]  Iled th e n ation al-scale rollou t,deploym en t,an d procu rem en tstrategy,train ed an d localized D evO pspracticesfor six
p1 y=  52.30 x=  52.28.. 526.88  [?@8.91262]  govern m en tsan d th eir M in istry ofH ealth departm en ts,arch itected C H T for A W S,G C P,an d localdata cen ters,an d
p1 y=  39.60 x=  52.28.. 317.43  [?@8.91262]  con tain erized th e w h ole application in th e 3.x-to-4.x m igration .
```

### The page's sub-headlines and category text

My reading of the hierarchy, from the sizes above. These are not his labels.

| Tier | Line(s), baseline y | Size (pt) | Has a film in `films/`? |
|---|---|---|---|
| Title block "hareet.ai" | 652.4 | 55.5 | linked to `https://hareet.ai/` (obj 22, 23), not a film |
| Tagline under it | 616.7, 599.6 | 11.9 | no |
| **Small-caps category row** under the tagline: LOCAL MODELS FIRST · A REAL-TIME COST METER · A $5-A-DAY KILL SWITCH · EVERY DATA FLOW DISCLOSED | **580.3**, x 64.8 to 552.2 | 7.17 | **yes, all four**: `local-first`, `cost-meter`, `kill-switch-b2`, `data-flows`; covered by obj 539 to 542 |
| Employer line "Medic …" | 552.8 | 14.9 / 10.4 / 8.7 | no |
| Section sub-headings "Build time AI around the CHT, …" and "Runtime AI inside the CHT, …" | 458.5, 194.1 | 10.4 / 8.2 | no film is about them |
| Item headings (cht-agent, Agentic data layer, …, SRE Lead) with role words on the right ("designed, architected, built") | 496.4 … 79.7 | 9.7 / 7.7 | no film is about them |

The films on this tree, all about h4reet.ai:

```text
$ git ls-files films | grep -E 'README.md$|\.mp4$'
films/README.md
films/cost-meter/README.md
films/cost-meter/media/cost-meter.mp4
films/data-flows/README.md
films/data-flows/media/data-flows.mp4
films/evals/README.md
films/evals/media/evals.mp4
films/kill-switch-b2/README.md
films/kill-switch-b2/media/kill-switch.mp4
films/lifecycle/README.md
films/lifecycle/media/lifecycle.mp4
films/local-first/README.md
films/local-first/media/local-first.mp4
films/stack/README.md
films/stack/media/stack.mp4
```

Three films (`evals`, `lifecycle`, `stack`) have no words on the page. Spec 023's Q4 kept four claims and left the evals film unlinked (provisional; the page's Q27).

## 3. Against spec 023 and his words

- Spec 023, FR-001: "The candidate carries four film links, one per claim: LOCAL MODELS FIRST, A REAL-TIME COST METER, A $5-A-DAY KILL SWITCH, EVERY DATA FLOW DISCLOSED, in the PDF's own wording of them." **Met**: obj 539 to 542, one rectangle per claim, each over its claim's glyphs only.
- FR-002 (targets `…/tree/main/films/local-first`, `cost-meter`, `kill-switch-b2`, `data-flows`): **met**, the same as `films/resume-links.json`.
- US1-AC3 (the approved file is the candidate's prefix; the appended section is only the page object with `/Annots` extended plus four `/Link` annotations with `/Border [0 0 0]`, no `/AP`, `/C`, `/JS`, or `/Launch`): **met** by the raw section above.
- US2-AC1 / SC-003 ("Until the Author acts, the served PDF is byte-identical to C-0002's"): **this is the state main is in**, and it is why his download has no film links.

His words: "the downloaded PDF doesn't have links to the films where the category text is listed in the sub headlines". My reading, beside them and not in their place: "the category text … in the sub headlines" fits the small-caps row of four categories under the "hareet.ai" title best. It is set as a sub-headline under the title, it lists categories, and it is the only text on the page that the films are about. The candidate's four annotations sit exactly on it. The Medic section's sub-headings (10.4 pt) are also sub-headlines, but no film covers them, so "links to the films" there would have nothing to point to.

**Verdict: yes.** On that reading, the four annotations sit on the sub-headlines he means. His download lacks them because main serves C-0002 and P8 hasn't been done.

## 4. Finding for spec 028's tasks

1. **No code task for item 3.** Neither the PDF, its writer (`apps/web/build/film-links.ts`, run only by the opt-in case in `apps/web/test/content/film-links.test.ts`), nor the table (`films/resume-links.json`) needs to change for the line read above.
2. **The fix is P8, his step** (`docs/merge-requests/human-patches/023.md`). Run `git mv apps/web/content/candidates/resume-author-links.pdf apps/web/content/resume-author.pdf` and add the C-0005 entry with SHA-256 `5de0e7eeaed34587d4d79e29f0cbfb7c577a224ce31616f1d75fcbe4e0ff21fb` in one commit on main. He does this in the morning, now, not after the repository is public. His answer (the night-3 page's Q2, his orders' rule 14), verbatim: "q2) I mean't when i downloaded the pdf, there was no link on those sub headlines "LOCAL MODELS FIRST". I figured that would have existed as we know what the link on the repo will be." Before the entry, in his terminal: `sha256sum` on the candidate prints the hash above, and `pdfinfo -url apps/web/content/candidates/resume-author-links.pdf` lists the four film URLs above; the four clicks from the PDF move to the day the repository goes public, since the links don't resolve before it (`corpus/08-hareet-ai.md`: "It isn't public yet"). (Corrected by `docfix-028`, rv-probes-028's PDF-I1: first written "after the repository is public … and after he has clicked each link from the PDF"; the check and the clicks' day are the page's Q26, its recommended answer taken provisionally under his rule 1, no `Answered:` line yet; `human-patches/023.md` now says the same.)
3. **Spec 028's stack note** should say this in one line beside his item 3, so his review finding isn't read as unfixed code.
4. **Route (b), dropped** (`docfix-028`, rv-probes-028's PDF-I1): this step first gave spec 023's route (b), his re-render of `resume/source/twin.html`, for an answer of "a different line" or "more films". His answer names the row, so it isn't taken.

## Question for the Author

Written to `/night/io/out/questions.md`, as asked (kept as written; its "once the repo is public" and route (b) are superseded by his answer, the page's Q2, quoted in §4; `docfix-028`, PDF-I1):

```text
### Q: In item 3, is the "category text … in the sub headlines" the small-caps row under "hareet.ai" (LOCAL MODELS FIRST · A REAL-TIME COST METER · A $5-A-DAY KILL SWITCH · EVERY DATA FLOW DISCLOSED), which the unpublished candidate already links to the four films, so the fix is your publishing step P8 once the repo is public?
Blocks: spec 028 (item 3; probe-pdf-028) · Recommended: Yes; that row, publish the candidate by P8 (human-patches/023.md) after the repo is public and you've clicked each link · Others: a different line (e.g. the Medic section's sub-headings, which no film covers), so you re-render from resume/source/twin.html (spec 023 route b); that row plus links to the evals, lifecycle, and stack films, which needs new text on the page and your re-render
```

## What I didn't do

- I didn't read his screenshot (`resume/Screenshot 2026-11-15 002519.png`). It is in his checkout, which this container can't reach, and this worktree has no `resume/` folder. Item 3 doesn't need it.
- I didn't build the site. There is no `node_modules`, and I installed nothing. The served file comes from the code and the policy (§1).
- I didn't check that the links resolve. The repository isn't public, and checking needs the network.

## Refusals

- No command was refused by the bash gate or a permission rule.
- One hook finding, not a refusal: the PostToolUse lint hook (`post-edit-check.sh`) reported ruff findings on my scratch reader `/tmp/probe-pdf-028-tools/pdfprobe.py`, which is outside the repository (I001, SIM115, FURB167 ×3, B023). I fixed them in that file. Nothing in the repository was involved.

- `make lint` didn't run to the end, so this is **not** a passing lint. It stops at its first step because this worktree has no `node_modules`. Its own fix is `make setup` (`npm ci --ignore-scripts`), which downloads the locked packages from the registry. I didn't run it, because the brief says "install nothing new from the network". This file is the branch's only change, and no `make lint` step reads it: `specs/` is in `.prettierignore` (line 43), and ESLint, tsc, ruff, and shellcheck don't read Markdown. The supervisor can run `make lint` on this branch where `node_modules` exists.

## make lint

```text
$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
exit: 2
```

The two lint steps that run without `node_modules` (run by hand; not a substitute for the full target):

```text
$ ruff check .
All checks passed!
exit: 0
$ ruff format --check --no-cache --extend-exclude corpus .
849 files already formatted
exit: 0
```
