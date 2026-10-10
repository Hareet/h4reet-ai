// A stand-in for Amazon Bedrock's Converse API (contracts/provider-adapter.md §5.3, mode 1). aws-sdk-client-mock 4.1.0
// replaces BedrockRuntimeClient's send, so no request leaves the process and no credentials are resolved. Each
// ConverseCommand gets the next queued behavior, as the OpenAI stub answers HTTP: an answer that honors the output cap,
// an SDK exception raised by name, a refused connection, a slow answer, or a malformed one. A canary sits in every
// error's message, so the suite can show none of it reaches a ProviderError (C6).
import { randomBytes } from "node:crypto";

import {
  AccessDeniedException,
  BedrockRuntimeClient,
  BedrockRuntimeServiceException,
  ConverseCommand,
  InternalServerException,
  ResourceNotFoundException,
  ServiceUnavailableException,
  ThrottlingException,
  ValidationException,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { mockClient } from "aws-sdk-client-mock";

import type { StubBehavior, StubControl, StubRequest } from "../contract/adapter-contract.js";

export interface StubBedrock extends StubControl {
  /** Raise this error on the next call, as the SDK or the connection would. */
  nextError(err: Error): void;
  /** Answer the next call with this output, as given. */
  nextOutput(out: ConverseCommandOutput): void;
  restore(): void;
}

type Queued = StubBehavior | { error: Error } | { output: ConverseCommandOutput };

const DEFAULT: StubBehavior = { ok: { text: "Hello.", inputTokens: 12, outputTokens: 3, finish: "stop" } };

/** The SDK exception Bedrock answers an HTTP status with, its message carrying the canary. */
function exceptionFor(status: number, canary: string): Error {
  const opts = { message: `refused: ${canary}`, $metadata: { httpStatusCode: status } };
  switch (status) {
    case 401:
      return new BedrockRuntimeServiceException({ ...opts, name: "UnrecognizedClientException", $fault: "client" });
    case 403:
      return new AccessDeniedException(opts);
    case 404:
      return new ResourceNotFoundException(opts);
    case 429:
      return new ThrottlingException(opts);
    case 503:
      return new ServiceUnavailableException(opts);
    default:
      return status >= 500 ? new InternalServerException(opts) : new ValidationException(opts);
  }
}

export function stubBedrock(): StubBedrock {
  const mock = mockClient(BedrockRuntimeClient);
  const canary = `bedrock-canary-${randomBytes(6).toString("hex")}`;
  const queue: Queued[] = [];
  const seen: StubRequest[] = [];
  let requestNo = 0;

  const answer = async (input: ConverseCommandInput): Promise<ConverseCommandOutput> => {
    seen.push({
      method: "POST",
      path: `/model/${String(input.modelId)}/converse`,
      headers: {},
      body: JSON.parse(JSON.stringify(input)) as unknown,
    });
    requestNo += 1;
    const next = queue.shift() ?? DEFAULT;
    if ("error" in next) throw next.error;
    if ("output" in next) return next.output;
    if ("delayMs" in next) {
      await new Promise((resolve) => setTimeout(resolve, next.delayMs).unref());
      return answer(input);
    }
    if ("refuse" in next) {
      throw Object.assign(new Error(`connect ECONNREFUSED 127.0.0.1:443 ${canary}`), {
        code: "ECONNREFUSED",
        syscall: "connect",
      });
    }
    if ("status" in next) throw exceptionFor(next.status, canary);
    if ("throttleOnce" in next) {
      queue.unshift(DEFAULT);
      throw exceptionFor(429, canary);
    }
    if ("malformed" in next) return { $metadata: { httpStatusCode: 200 } } as ConverseCommandOutput;
    const cap = input.inferenceConfig?.maxTokens ?? Number.POSITIVE_INFINITY;
    const capped = next.ok.outputTokens > cap;
    const stop = capped
      ? "max_tokens"
      : { stop: "end_turn", length: "max_tokens", content_filter: "content_filtered" }[next.ok.finish];
    return {
      output: { message: { role: "assistant", content: [{ text: next.ok.text }] } },
      usage: {
        inputTokens: next.ok.inputTokens,
        outputTokens: capped ? cap : next.ok.outputTokens,
        totalTokens: next.ok.inputTokens + (capped ? cap : next.ok.outputTokens),
      },
      stopReason: stop as ConverseCommandOutput["stopReason"],
      metrics: { latencyMs: 1 },
      $metadata: { httpStatusCode: 200, requestId: `req-${requestNo}` },
    };
  };
  mock.on(ConverseCommand).callsFake((input: ConverseCommandInput) => answer(input));

  return {
    canary,
    next: (behavior) => void queue.push(behavior),
    nextError: (error) => void queue.push({ error }),
    nextOutput: (output) => void queue.push({ output }),
    requests: () => seen,
    reset: () => {
      queue.length = 0;
      seen.length = 0;
    },
    restore: () => mock.restore(),
  };
}
