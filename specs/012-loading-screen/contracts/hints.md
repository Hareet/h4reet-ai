# Contract: the hints file, its slots, its checks, and the index's field

The hints below the loader's bar, as data. Spec: FR-028 to FR-036; The Hint Copy. Plan: §7. It adds a file to spec 004's room data files ([room-data-files.md](../../004-room-composition/contracts/room-data-files.md) §1; Amendment L8) and a field to its index ([room-bundle.md](../../004-room-composition/contracts/room-bundle.md) §3.1; Amendment L7). A file named here that doesn't exist yet is named in a code span, never linked.

## 1. The file: `apps/web/room/hints.yaml`

```yaml
version: 1
hints:
  - id: ask-how-built
    by: author
    text: "Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure."
    words_from:
      - file: specs/012-loading-screen/intent.md
        quote: "Make sure to ask how this web site is built, how we evaluated outputs, designed and made it secure."
  - id: point-and-list
    by: session
    text: 'As you point at a piece you can talk about, a border lights up around it. Each one is also in the "{ui:list.heading}" list, for a keyboard or a screen reader.'
    sources:
      - specs/008-visitor-movement/spec.md
      - apps/web/room/ui-words.yaml
```

| Key | Type | Rule |
|---|---|---|
| `version` | `1` | required |
| `hints` | list, 1 to 20 | required; the order is the loader's (D3) |
| `hints[].id` | string, `^[a-z0-9]+(-[a-z0-9]+)*$`, 1 to 40 characters | required; unique in the file |
| `hints[].by` | `author` or `session` | required |
| `hints[].text` | string, 1 to 200 characters before its slots are filled | required; slots of §2 only |
| `hints[].words_from` | list of `{file, quote}`, exactly one | required where `by` is `author`; absent otherwise |
| `hints[].sources` | list of repository paths, 1 to 6 | required where `by` is `session`; absent otherwise |

No other key. A hint of the Author's carries no slot. The sources are for review and the checks; they never reach the bundle.

The file is optional, as a fixture room's may lack it: absent, or with every hint left out (§4, RT17), the index's `hints` is empty and the loader shows its bar with no hint area (spec FR-032).

## 2. The slots

A slot is `{` + a name + `}`. The closed list:

| Slot | Filled with | From |
|---|---|---|
| `{ui:<key>}` | the UI word's text | `apps/web/room/ui-words.yaml`; the key must be on the closed list and its word must hold no slot |
| `{budget.daily_usd}` | prod's daily ceiling | `config/budgets.yaml`, `envs.prod.daily_usd` |
| `{budget.monthly_usd}` | prod's monthly ceiling | `config/budgets.yaml`, `envs.prod.monthly_usd` |
| `{budget.fallback_daily_usd}` | prod's fallback allowance a day | `config/budgets.yaml`, `envs.prod.fallback_daily_usd` |
| `{price.input}` | the paid fallback's input price per million tokens | `config/prices.yaml`: the last version in the file, its entry whose `model` is the model of the adapter `config/routing.yaml`'s `envs.prod.fallback` names |
| `{price.output}` | the same entry's output price | as `{price.input}` |

**Amounts** are written in US dollars: `$`, then the whole dollars where the cents are 0 (`5.00` → `$5`), else at least two decimals, with zeros past the second trimmed (`0.1` → `$0.10`, `0.5` → `$0.50`, `0.075` → `$0.075`).

**Where the figures come from.** The build reads the three configuration files through the same tree that reads `config/budgets.yaml`'s `limits.twin` and `config/twin-readiness.yaml` today (`build/room/readiness.ts`), so the web image's build and a checkout's agree; plan §7.2 and its T001 confirm the road. The last version in `config/prices.yaml` is used, not the one in force at the build's clock, so a build is the same whenever it runs; a version whose `effective_from` lies in the future shows its price early, which the review catches.

## 3. The index's field

`RoomIndex` gains, after `models`:

```ts
/** The loader's hints, filled, in the file's order; a hint whose slot couldn't be filled is left out (spec 012). */
hints: string[];
```

At most 20 strings of at most 160 characters each, inside the index's 16 KB (`test/room/chunk.test.ts`).

## 4. The checks

In spec 004's words family (§13.5), whose rules the compositor runs in every build, strict or lenient as §15 sets:

| ID | Refused | Spec |
|---|---|---|
| RT2 | (extended) Spec 002's C9 over every hint's text: a "Do not claim" key phrase, the surname rule, or a private-denylist phrase where the session can read the denylist | FR-034 |
| RT3 | (extended) A digit outside a slot in a hint's text | FR-033 |
| RT9 | (extended) In strict mode, a hint's `words_from` quote that isn't verbatim in its file once whitespace is collapsed, or a file that isn't an intent | FR-032 |
| RT14 | A session hint with no `sources`, or a source the tree doesn't hold | FR-032 |
| RT15 | An Author's hint without exactly one `words_from`, or whose `text` isn't its quote exactly, character for character, whitespace included | FR-029, FR-032 |
| RT16 | A hint longer than 160 characters once its slots are filled | FR-033 |
| RT17 | A slot outside §2's list; a `{ui:…}` key off the closed list or whose word holds a slot; or a slot the build can't fill. Lenient: the hint is left out of the index and the build prints a `warn` line naming it; strict: refused | FR-033 |

A malformed file (an unknown key, a duplicate `id`, a `by` other than the two, a list outside its bounds) is refused by the shape family, RD, as for every room data file. A reason names keys and IDs, never a hint's text.

## 5. Words typed in a session hint

Where a session hint quotes words of the room that no UI word holds, a test in `apps/web/test/room/hints.test.ts` pins each to its source, so a rename fails the test rather than leaving the hint wrong:

| Hint | Typed words | Pinned to |
|---|---|---|
| 5 | "Send" | `src/talk/talk.ts`'s submit button's words |
| 6 | "Engineer", "Not an engineer" | `src/choice/visit.ts`'s `PATHS` names |
| 10 | "local", "est." | the first word of `sign.local` and the last of `sign.estimated`, in `apps/web/room/ui-words.yaml` |

## 6. The copy

The first file's hints are the spec's [The Hint Copy](../spec.md#the-hint-copy), in its order, with the slots it names. Changing one is a data edit, which the checks above hold; the Author's hints change only with his words in the intent.
