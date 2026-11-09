// The paid adapters the alert catalogue's fixed facts name (spec 011, FR-004; its plan §7.3, departure B5): Bedrock and
// the Anthropic API, by the IDs config/routing.yaml gives them and their types' own labels, as their real alerts name
// them (spec 010, FR-037). They live here because nothing outside src/adapters/ names a provider (SC-006): the
// catalogue reads them from this module.
import { ADAPTER_TYPE_SPECS } from "./_settings.js";

const labelOf = (type: string): string => {
  const label = ADAPTER_TYPE_SPECS.get(type)?.label;
  if (label === undefined) throw new Error(`the adapter type ${type} has no label`);
  return label;
};

/** The catalogue's two paid adapters: one with SSO credentials that expire, and one capped by the month. */
export const SAMPLE_ADAPTERS = {
  sso: { id: "bedrock", label: labelOf("bedrock-converse") },
  capped: { id: "anthropic", label: labelOf("anthropic-messages") },
} as const;
