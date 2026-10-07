---
name: intent-capture
description: Brainstorm an idea, incident, or finding into an intent.md using the project template. Use whenever the Author says "new intent", "capture this", "write this up as intent", or when a control band or incident needs an intent.
---
# Intent capture

1. Ask the analyst's questions, briefly and only where the answer isn't already given: who cannot do what today; what better looks like in their terms; who and what is affected; the constraints (budget, privacy, constitution principles); what success looks like; what is out of scope.
2. Draft `intent/NNN-short-name.md` from the template in `intent/README.md` (next free number, `Status: draft`). Keep the Author's own words wherever possible — this is a proto-spec, not a design.
3. Always fill **Expected cost impact** and **Data-flow impact**; "None" is acceptable only if true.
4. Read the draft back and ask the Author to correct anything misunderstood before they commit it. Do not commit on their behalf.
5. For incident- or band-generated intents, attach the evidence (trace IDs, metric snapshot, timestamps) under Problem and set `Author: closing-the-loop`.
