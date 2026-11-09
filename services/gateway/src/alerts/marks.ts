// The marks of the designed forms (spec 011, FR-006, FR-007, FR-020; Q2's answer; plan §3.1): each alert's severity,
// shown by its name in words and its emoji, and in the email by its colour too, so no form carries severity by colour
// alone; and each kind's emoji. Every emoji is one code point, or one and U+FE0F, so its length in UTF-16 code units
// is fixed: ⏰ and ⚪ one; 🔴, 🟠, 🔵, 📈, 🛑, 💸, 🔑, 🔌, 🔐, and 🧪 two; 🛠️ and 🗄️ three. The tests pin them, since
// Telegram's entity offsets after an emoji count its units.
//
// The palette beside them (plan §3.1): every text pair at 4.5:1 or more and every bar on its track at 3:1 or more in
// both schemes, which test/unit/email-design.test.ts computes from these values.
import type { AlertKind } from "../telemetry/metrics.js";
import type { AlertSpec } from "./format.js";

export type Severity = "critical" | "warning" | "operator_action" | "information";

export const SEVERITIES: Readonly<Record<Severity, { name: string; emoji: string }>> = {
  critical: { name: "Critical", emoji: "🔴" },
  warning: { name: "Warning", emoji: "🟠" },
  operator_action: { name: "Operator action", emoji: "🔵" },
  information: { name: "Information", emoji: "⚪" },
};

/** Each kind's severity (Q2's answer): every variant of a kind shares it. */
const SEVERITY_OF: Readonly<Record<AlertKind, Severity>> = {
  trip: "critical",
  fallback_exhausted: "critical",
  store_unreachable: "critical",
  warn: "warning",
  credentials_expiring: "warning",
  fallback_unavailable: "warning",
  auth_failed: "warning",
  operator_action: "operator_action",
  reminder: "information",
};

export const KIND_EMOJI: Readonly<Record<AlertKind, string>> = {
  warn: "📈",
  trip: "🛑",
  fallback_exhausted: "💸",
  operator_action: "🛠️",
  credentials_expiring: "🔑",
  fallback_unavailable: "🔌",
  auth_failed: "🔐",
  store_unreachable: "🗄️",
  reminder: "⏰",
};

/** A sample's mark (FR-036). */
export const SAMPLE_EMOJI = "🧪";

export const severityOf = (spec: AlertSpec): Severity => SEVERITY_OF[spec.kind];

export interface Marks {
  severity: Severity;
  /** The severity's name, in words. */
  name: string;
  severityEmoji: string;
  kindEmoji: string;
}

export function marksOf(spec: AlertSpec): Marks {
  const severity = severityOf(spec);
  return {
    severity,
    name: SEVERITIES[severity].name,
    severityEmoji: SEVERITIES[severity].emoji,
    kindEmoji: KIND_EMOJI[spec.kind],
  };
}

interface Scheme {
  /** Each severity's band: its colour, and the text on it. A bar's fill is the band's colour. */
  band: Readonly<Record<Severity, { background: string; text: string }>>;
  /** Around the card: no text sits on it. */
  page: string;
  card: string;
  /** Body text and labels on the card. */
  text: string;
  label: string;
  /** A bar's track, under its fill. */
  track: string;
  /** The warning's tick, under the bar, on the card. */
  tick: string;
}

/** The email's two palettes (plan §3.1): the light one inline, the dark one under prefers-color-scheme: dark. */
export const PALETTE: Readonly<{ light: Scheme; dark: Scheme }> = {
  light: {
    band: {
      critical: { background: "#B42318", text: "#FFFFFF" },
      warning: { background: "#B54708", text: "#FFFFFF" },
      operator_action: { background: "#175CD3", text: "#FFFFFF" },
      information: { background: "#475467", text: "#FFFFFF" },
    },
    page: "#F2F4F7",
    card: "#FFFFFF",
    text: "#101828",
    label: "#475467",
    track: "#EAECF0",
    tick: "#101828",
  },
  dark: {
    band: {
      critical: { background: "#FDA29B", text: "#101828" },
      warning: { background: "#FEC84B", text: "#101828" },
      operator_action: { background: "#84CAFF", text: "#101828" },
      information: { background: "#D0D5DD", text: "#101828" },
    },
    page: "#0C111D",
    card: "#0C111D",
    text: "#F2F4F7",
    label: "#98A2B3",
    track: "#344054",
    tick: "#F2F4F7",
  },
};
