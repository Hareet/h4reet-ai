<!-- Source: transcript supplied by Hareet on 2026-09-15 of a recorded "Ground Truth" conversation (Medic's series on technology in community health) between Andra, Medic's chief executive (introduced in the recording as co-executive director), and Taylor Downs, founder and CEO of OpenFn. The raw transcript is deliberately NOT stored in this public repository. The recording is not public. Hareet cleared these attributed, paraphrased notes for the public corpus on 2026-10-07; the corpus never links to the recording or says a link is coming. -->

# Notes: Ground Truth — Andra (Medic) with Taylor Downs (OpenFn)

## Why this matters to the corpus
Chronology matters here. Hareet and Andra defined Medic's two AI tracks — AI for the people who build the DPG, and AI for community health workers — and the strategy's categories in early 2025; the strategy was published in 2025. This conversation took place in summer 2026. It supplied the words **buildtime AI** and **runtime AI**, and a sharper account of the two tracks' differences, opportunity, impact, and importance to stakeholders, which Hareet adopted because it communicated the existing tracks better. On the recording Andra says Medic already thought in two tracks. The twin credits the wording to Taylor Downs and the tracks to Hareet and Andra.

## Points made in the conversation (attributed)
- **Taylor Downs**: the biggest change in the last two years for government projects is not agents making runtime decisions; it is AI drastically cutting the time and resources needed to build secure, stable workflows that themselves do not rely on AI. Adoption is happening at build time far more than at runtime, and that is the right first step.
- **Taylor Downs**: OpenFn had long punted on a point-and-click builder for complex integrations; LLMs let them go from business requirements to human-verifiable code instead — organizations use OpenFn's AI to build non-AI workflows.
- **Taylor Downs**: engineers do their best work when properly sandboxed and confident they can't break production; what goes to national scale should be deterministic — no runtime call to a frontier model.
- **Andra**: build-time AI is also where access is easiest — developers have connectivity and model access; running a language model on a two-gigabyte device far from anywhere is a different problem. (The problem Voice to CHT takes on.)
- **Taylor Downs**: locally deployed platforms can use a cloud AI service at build time if data is scrubbed before it leaves — data sovereignty is preserved at build time in a way runtime AI on citizen data would not be.
- **Andra**: Medic published guidance to its maintainers that the typing was never the point — humans are responsible for what they merge. (Public: CHT AI assistance guidelines.)
- **Taylor Downs**: AI's best role, at build time or runtime, is to flag for further review and escalate to a responsible human; OpenFn runs three independent agent security reviews on every pull request, then a human merges. (Precedent for this repo's `REVIEW.md` pattern.)
- **Taylor Downs**: responsibility language matters — "Claude wrote X" versus "I wrote X" — small "micro-abdications" erode ownership; good friction increases engagement, bad friction adds bureaucracy.
- **Taylor Downs**: open-source sustainability is really institutional sustainability; DPGs serving governments should offer embargoed security builds ahead of public disclosure.

## Do not claim from this source
- That Hareet coined the words buildtime/runtime AI, or that he was part of this conversation — and equally, that the tracks or categories originated here. They predate it.
- Any OpenFn practice as Medic's or Hareet's.
