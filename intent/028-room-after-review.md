# Intent: the room after the Author's review of main
Author: the Author (his review of main, 2026-11-15, and his orders for night 3), drafted by the night-shift spec-writer for spec 028 on the night of 2026-11-15. Status: draft. Created: 2026-11-15.

## Problem

The Author ran main locally (`make up ENV=prod`) and reviewed it, 2026-11-15, verbatim:

> 1. The Conversation UI is good, in that convo panel on the left side of the page, let's remove the thumbnail icon view, and let's make that conversation panel UI the length of the left side of the page, so it should be the same length as the room wall. 2) The dinosaur doesn't load the model, or do any of the eating of assets. 3) When I view the resume and download the PDF, the downloaded PDF doesn't have links to the films where the category text is listed in the sub headlines. 4) The dog isn't supposed to show all the time, or when a different visitor is selected. Only when someone selects the dog, does it come in the room, or if someone selects the dinosaur, then the twin should wave, scream that there is a dinosaur in the room, then the dog enters the room and the twin adn the dog grab the bicycle and leave, and the dinosaur can then eat the assets. If the dog was selected, then the twin has one introduction sentence about how much they love Arya, and all the adventures we've had of course, i'll show her all the work i've been doing, and then the dog selected visitor is the same concept as the woman or man visitor, they will just engage with the twin or the room assets. 4) Delete the warning labels in the top left corner "This is an AI Twin." "The AI dog is a nova scotia ... ", and delete the bottom panel below the room "Around the room listing". 5) The UI on the right side lays over itself, when hovering over the snowboard, you can see the UI highlight snowboard and the enter button is covering up some of it, making it not legible.

> And align the UI elements so they are next the room wall, and take up all of the grey space, i.e. make the bigger, and responsive so that they are not all teh way to the corners as seen in teh screen shot

His answers to two questions (2026-11-15), as the orders record them:

- The top-left labels: "Keep top banner (Recommended)": delete the three top-left labels (the twin's likeness line, the dog's line, the placeholder note); keep the top-centre banner "You're talking with an AI representation of the Author, not the Author" (the constitution's disclosure principle); move the likeness lines to the Credits page.
- "Around the room": "Hide, keep for readers (Recommended)": no panel below the room on screen; screen readers and the phone layout still get the text.

The option labels in quotes are his choices; the text after each colon is how the orders record what each choice means.

His screenshot (`resume/Screenshot 2026-11-15 002519.png`, in his checkout, untracked) was out of this session's reach. The orders describe it, in their words, not his: "the conversation panel and its twin thumbnail sit small at the far top-left corner, the piece list and its controls at the far top-right, the bottom-right buttons in the far corner, all with wide grey bands between them and the room; the dinosaur visitor shows as the flat green stand-in with the white placeholder rectangle; the dog stands in the room although the dinosaur was chosen; on the right list, "Snowboard"'s highlight and the Enter hint overlap."

His answers to the morning page's Q2 (the PDF's links) and Q3 (the dinosaur's eating), in his orders' rule 14 (2026-11-15, about 01:20 his time), verbatim: "q2) I mean't when i downloaded the pdf, there was no link on those sub headlines "LOCAL MODELS FIRST". I figured that would have existed as we know what the link on the repo will be. q3) keep it as waiting for model intake p9". Added by the spec's rework (`rework-spec-028`); spec 028's Q19 and Q11 carry them, with readings beside.

He asked, in his words (2026-11-15, about 00:40 his time): "And we want you to use the night shift agent set up to accomplish all of these items. I'm going to bed for the night"

## Proposed outcome

Only what his review says. Reading (this intent's, for the Author to correct; it is not his): his numbered points, the second "4)" read as a fifth point, and the closing paragraph about alignment, each becomes one requirement of spec 028; his point 2 (the dinosaur's model and eating) and his point 3 (the PDF's links) are first checked by two probes, because the dinosaur's model and the published resume are his hand's (an asset's look approval; publishing a PDF).

## Affected users and systems

Visitors (the room's layout, the conversation panel, the right column, the room's scene and its visitors), screen-reader and phone visitors ("Around the room" kept for them), the Author (his look approval, his corpus proposal if the dog visitor's line must be corpus, publishing the resume PDF), the room's runtime and tests, the Credits page.

## Constraints

The constitution's principles apply: honest AI (the top-centre banner stays; the likeness lines move to the Credits page, not away), degraded mode first, accessibility (screen readers keep "Around the room"), reduced motion, the first visit's budget, the corpus is the Author's hand only, and no byte about the visitor's choice leaves the device. What stays his: every merge and push, every human-only path, his look approval of any asset, publishing a resume PDF.

## Expected cost impact

None in the cloud expected; layout and in-room behaviour are local. Dev-time model spend only.

## Data-flow impact

None new expected.

## Open questions

The dog visitor's introduction line (whose words, and whether it must be corpus), what the twin's "scream" is (a speech bubble, a sound, or both), where the twin and the dog leave to with the bicycle, whether the four film links of the published-by-hand candidate PDF sit on the sub-headlines he means, and why the dinosaur's eating didn't happen in his review: carried to the spec's clarifications, each with a recommended answer. His Q2 and Q3 words above answer the last two.
