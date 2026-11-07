// The lookdev page's entry on the site (spec 004; contracts/lookdev.md §1): lookdev/index.html loads it, and it builds
// the page with no probe, which only the phone copy runs (phone.ts).
import { startLookdev } from "./main";

startLookdev(document.getElementById("lookdev") ?? document.body, { phone: false, probe: null });
