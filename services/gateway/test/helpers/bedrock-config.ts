// prod's route with a Bedrock fallback (contracts/config-files.md §1.2's last step), in a directory of its own, and a
// test-only price for its model: what tasks.md T105 will fill. The test removes the directory.
import { copyFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = fileURLToPath(new URL("../fixtures/config/", import.meta.url));
export const MODEL = "us.anthropic.claude-test-v1:0";

/** prod's route with a Bedrock fallback (config-files.md §1.2's last step), and a test-only price for its model. */
export async function bedrockConfigDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "h4-config-bedrock-"));
  for (const file of ["budgets.yaml", "alerts.yaml"]) await copyFile(join(FIXTURES, file), join(dir, file));
  await writeFile(
    join(dir, "routing.yaml"),
    `schema: 1
deadline_ms: 20000
adapters:
  local:
    type: openai-compatible
    kind: local
    provider: local
    base_url_env: LOCAL_MODEL_BASE_URL
    model_env: LOCAL_MODEL_NAME
    timeouts: { connect_ms: 1000, request_ms: 10000 }
    health: { path: /models, interval_ms: 1000, timeout_ms: 800, unhealthy_after: 1, healthy_after: 3 }
  bedrock:
    type: bedrock-converse
    kind: paid
    region: us-east-1
    model: "${MODEL}"
    additional_request_fields: {}
    timeouts: { connect_ms: 1000, request_ms: 2000 }
    retry: { on: [rate_limited], max: 1, backoff_ms: 50 }
    circuit: { failures: 3, open_s: 30 }
    health: { interval_ms: 10000 }
    credentials_warn_before_s: 7200
envs:
  prod: { primary: local, fallback: bedrock }
  dev: { primary: local }
`,
  );
  await writeFile(
    join(dir, "prices.yaml"),
    `schema: 1
currency: USD
unit: per_million_tokens
versions:
  - id: "2026-10-08.1"
    effective_from: "2026-10-08T00:00:00Z"
    source: "the adapter-calls test: a made-up Bedrock price"
    entries:
      - provider: local
        model: "*"
        input: 0
        output: 0
      - provider: aws.bedrock
        model: "${MODEL}"
        input: 1
        output: 5
`,
  );
  return dir;
}
