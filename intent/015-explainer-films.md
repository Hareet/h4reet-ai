# Intent: explainer films for the resume's claims

Author: the Author. Status: accepted on 2026-11-12 (the Author: "Accept intent 15."). Created: 2026-11-10.

## Problem

The resume's twin section (`resume/source/twin.html`, untracked) makes four claims in small caps: "Local models first", "A real-time cost meter", "A $5-a-day kill switch", "Every data flow disclosed". A reader who wants proof has nowhere to go but the repository. In the Author's words (2026-11-10):

> "I want to create explainer videos that discuss and demonstrate those concepts and that eventually i can change the resume links to point to those videos."

> "Build the videos to what the spec will eventually say. Those are being built in parallel so by the time you finish, or we finish iterating on the videos, the final specs as written will be working. We can add another video around evals if it doesnt fit and we can update the resume later to say that, for now give me both types of videos. It's okay for us to combine sections if we want to, we can discuss the "How data is disclosed" first as through the doc on what the visitor says, and then go into what the twin says and how we are evaluating it all. Also cut the eval as a separate video entirely as i think that section is important to display."

What each film covers, in the Author's words:

- **Local models first:** "should list our entire local container stack, and then highlighting the local model container, and through the importance of offline models, alongside our building of offline models for CHT, the work at denverlocal.ai that is based around the same workflow. What it means to run the stack and build for production."
- **A real-time cost meter:** "should explain how we set up langfuse locally, how we secured it, how we are displaying the cost, why it is important for us to observe and measure, how we evaluated which model we needed (we chose haiku since our context base is small and manually evaluated haiku and sonnet)."
- **Every data flow disclosed:** "Let's run through how we created teh evaluations, highlighting all of our make evals across every user scenario alongside hallucinations and guardrails we built into the twin to ensure nothing fake gets said, as well as how we are monitoring and continually improving the guard-rails."
- **A $5-a-day kill switch:** "should illustrate the cool feature and illustrate how we handle security via the tunnel as well as agentic security during the build out on what is colloborative agents are capable of."

## Proposed outcome

Seven films, made with the huashu-motion skill as editable code (HTML and GSAP) and rendered to MP4, in the one language the Author chose on 2026-11-10 ("I think I like video b better … I liked the flow of animation from C"; then "That looks great! I like that flow, let's do that for the others."):

1. A $5-a-day kill switch (`films/kill-switch-b2`).
2. A real-time cost meter (`films/cost-meter`).
3. Every data flow disclosed: the disclosure doc first (what leaves the visitor's device), then what the twin says and how it's checked (`films/data-flows`).
4. The evals, on their own (`films/evals`); the Author: "cut the eval as a separate video entirely as i think that section is important to display."
5. Local models first (`films/local-first`).
6. The stack, container by container (`films/stack`); the Author: "another video that covers each container in our stack, what it is doing, why it is there, what happens if it fails, what alerts, what observability looks like."
7. How it's built (`films/lifecycle`); the Author: "another video on the development lifecycle, how do we add a new feature, how do we modify a feature, what happens when we report a bug, what agents would build, test, and deploy it ensuring to cover security and our SRE best practices."

Also: a landing page per film (`films/<name>/README.md`) for the resume to link to; a Films section in the repository's README with one film shown inline as a GIF; and a plan for the resume's claims to link to the films (`films/RESUME-LINKS-PLAN.md`). Three earlier cuts of the kill-switch film stay for the record (`films/kill-switch`, `-b`, `-mix`).

Defaults the session took on 2026-11-10 (the Author can change any): 16:9; about 90 s for the first five and 2½ minutes for the last two; a synthetic voice (Kokoro) reads the session's scripts, which the Author approved, and the Author may record over a locked cut; no "Made with huashu-motion" signature (the Author: "Switch the "made with huashu-motion" off unless its required by the license"; the licence is MIT and doesn't require it, though its notice ships beside each vendored copy).

## Affected users and systems

- Resume readers and visitors, once the Author links the films.
- `films/`: one project per film. The site doesn't build or serve it, and nothing in the stack runs it. The rendered MP4s and one GIF go in `films/<name>/media/` once the arrival check admits them (ADR 0050).
- The repository's README (a Films section) and the resume (its claims linking to the films' pages, after publication).
- No change to `apps/web`, `services/`, `deploy/`, `config/` or `corpus/`.

## Constraints

- Every string and number on screen points to a source in the repository, the corpus, or the Author's words above; each film's `materials.md` lists them. Corpus "do not claim" lines hold (for example: no quantization or model names for CHT beyond the resume's own words; denverlocal.ai has no client work and doesn't always run offline).
- Films show the system as the specs say it will be (the Author's instruction above). Where a spec isn't built yet (spec 001's outbound tunnel and relay; spec 014's sign labels), the film follows the spec's text.
- No secret, token, key, private photo or private path on screen. Captures come from dev-cpu or are masked.
- The films vendor their own fonts and libraries (`films/<film>/vendor`); nothing is fetched at render.

## Expected cost impact

None in cloud spend. Rendering is local (Chrome and FFmpeg on the Author's machine). Narration drafts use a local system voice. Dev-time model spend: the session's own work only.

## Data-flow impact

None from the site: the films live in the repository, and the Author decided on 2026-11-10 to keep them there ("we'll keep it in films"; "we are going to merge these videos into the main repo, and then push everything up"), so readers watch them on GitHub, which the site doesn't call. The room doesn't link them; if it ever does, that link opens only on a visitor's click.

## Open questions

- Whether the Author records the narration or keeps the synthetic voice.
- Whether the resume gets a fifth line for the evals film.
- The spec stage is waived for these films (constitution III): they are media, not product code. The merge-request note names it as a deviation. The Author, 2026-11-12: "Agree to spec waiver."
