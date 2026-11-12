# Treatment: a $5-a-day kill switch (direction C, the stack in section)

Chosen by the Author on 2026-11-10 ("I like C"). One world for the whole film: the stack as glass slabs in space, a visitor's request as a beam of light, and the camera following that request. The world is the series' world: each of the five films visits another station in it.

## Script (narration, ~215 words, ~88 s at 150 wpm)

System voice for the draft; the Author may record over the locked cut. No pronoun for the Author: "Hareet". Sources are in `materials.md`.

1. **hook** — Every answer the twin gives can cost money. So the stack has a ceiling: five dollars a day, twenty a month.
2. **layers** — Every question falls through the same layers. The edge lets nothing in from the internet. The gateway reads the kill switch before anything else, and if it can't read it, it assumes the worst.
3. **meter** — Local answers cost nothing. Paid ones are metered to the millionth of a dollar, in the gateway's own database.
4. **warning** — At three fifty, a warning goes out on Telegram and email.
5. **stop** — At five dollars… it stops itself.
6. **trip** — One transaction sets the switch, opens an incident and queues the alert. Every request after that gets one line, local answers included.
7. **visitor** — "The twin can't talk right now. Today's budget for its answers is used."
8. **reset** — A new day doesn't bring it back. Only an operator reset does: a person, with a reason, in the audit log.
9. **proof** — The breach test trips it on purpose: fifty-two assertions, fifty-two passed.
10. **walls** — From outside, there's no door to knock on. The stack opens no inbound ports; it's reached only through an outbound tunnel, and only the gateway has a road out.
11. **agents** — The agents that built it work behind walls too. Each has one role, and the one that writes never reviews. They run on their own engine, can't touch the budgets or the switch, and can't push, merge or apply. Three hundred forty-five forbidden actions are tested to stay blocked, and only Hareet runs the final gate.
12. **end** — A five-dollar-a-day kill switch. Built in the open, at hareet.ai.

## Rhythm sheet

Route: **continuous** (one camera through one world) with **one montage burst** (the meter's calls) and **one stop** (before "it stops itself"). 100 BPM: a beat is 0.6 s, a bar 2.4 s.

| Stretch       | Time    | Energy | Camera (world stations below)                                                                                                                                    | Events per bar |
| ------------- | ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| hook          | 0–6 s   | 6      | swing reveal: frame 0 close and oblique on the resume's small-caps line, which tilts away and becomes the top slab; the stack below already in view              | 3              |
| layers        | 6–19 s  | 4→5    | follow the beam down: push past the room slab, the edge, land on the gateway; lamps light as the beam reaches each                                               | 2–3            |
| meter         | 19–30 s | 5→8    | orbit the state slab; **burst**: calls drop as beads, `$0.10` ticks, the meter bar climbing, one per beat, then eighths; amber at 3.50, the alert card flies out | 4–8            |
| stop          | 30–32 s | 1      | everything holds; the music drops out for a bar                                                                                                                  | 0–1            |
| trip          | 32–40 s | 9      | snap on the downbeat: the state slab floods crimson, the gateway's lamp reads `refused`, the beam stops dead on it; crane up                                     | 4              |
| visitor       | 40–46 s | 3      | push to the room slab: the visitor's line types on, held                                                                                                         | 1              |
| reset + proof | 46–58 s | 6→7    | dolly along a terminal slab: the breach test's real rows scroll, PASS on each beat; the counter to 52 / 52                                                       | 4–6            |
| walls         | 58–68 s | 5      | crane out: the whole stack inside a wall, the edge's ports on 127.0.0.1, one outbound tunnel leaving through the wall, the gateway's egress line                 | 2              |
| agents        | 68–83 s | 6      | track across to the build site beside the stack: six role cards in a row, the gate between them and `main`; refused commands bounce off it                       | 3              |
| end           | 83–90 s | 3      | land flat on the resume's line: "A $5-A-DAY KILL SWITCH", hareet.ai                                                                                              | 1              |

The burst sits at 21–30 % and the peak at 36 %: early for a launch film, right for an explainer whose second half is "why you can trust it".

## World stations (CSS 3D page world, px, y down, z towards the camera)

| Station                  | Where                           | What                                      |
| ------------------------ | ------------------------------- | ----------------------------------------- |
| resume card              | z 1200, above the room          | the twin section's line, white paper      |
| room                     | z 900                           | "a visitor asks the twin", the reply line |
| edge                     | z 600                           | `127.0.0.1 only`, six port pips           |
| gateway                  | z 300                           | the lamp, the read-first arrow            |
| model-server / anthropic | z 300, x ±1100                  | the two routes, local $0 / paid metered   |
| gateway-state            | z 0                             | the meter bar, the switch, the ledger     |
| terminal slab            | z 0, x +1500                    | the breach test's rows                    |
| wall + tunnel            | around all, at the edge's level | the outbound tunnel                       |
| build site               | x −2600                         | six role cards, the gate, `main`          |

## Four stills (render with `om still films/kill-switch --at 1.2,24,34,86`)

- **hook (1.2 s):** the resume line mid-tilt, the stack below.
- **densest (24 s):** the state slab in orbit, beads falling, the meter at $2.90, the alert card leaving.
- **hero (34 s):** the crimson flood, the beam stopped on the gateway, "refused".
- **end (86 s):** the resume line, flat.

## Continuity chain

resume line → (tilts into) the room slab → (the beam carries the eye down) edge → gateway → (the beam's bead) the state slab's meter → (the meter's fill turns crimson) the flood → (crane up along the beam) the room slab and the visitor's line → (the line's caret slides right into) the terminal slab → (crane out) the whole stack walled → (track along the wall) the build site → (the gate's `main` card flips flat into) the resume line.

## Music and sound (chosen by the director)

World: pulse minimalism — a clock-like marimba and pluck ostinato at 100 BPM in D minor, a low string pad; the motif is the meter's own rhythm (three ticks and a held note). The burst doubles the pulse to eighths; the stop is one empty bar; the trip lands on a sub drop and a low string chord; the agents' section brings the drums in quietly; the end returns the motif on the marimba alone. Hits: a tick per call bead, a soft `thud` per lamp, `impact` + `subdrop` on the trip, a `pop` climbing the scale per PASS row, a `glitch` per refused command at the gate, `chime` on the end card.

## Departures from the skill's defaults

- No signature (the Author's call; MIT doesn't require it).
- The peak is at 36 %, and the second half is calmer than a launch film's, because the explainer's payoff is trust, not hype.

## Changes while building (2026-11-10)

- The camera looks down on the stack (the room on top, gateway-state at the bottom), and the layers above the one in focus turn to ghosts so the deeper one reads.
- The alerts arrive as flat notifications at the top right instead of cards in the world: the one flat beat the depth direction allows, and they read like the real Telegram messages.
- The narration drives the timing: Kokoro's take respaced so the meter's burst has 3 s without words, the stop is 1.35 s of silence, and the trip lands on "stops". The film is 91 s.
