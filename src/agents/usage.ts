/** What a run, or one call of it, used: input tokens (uncached, cache writes and reads), output tokens, turns and cost. */
export type Usage = { inputTokens: number; outputTokens: number; turns: number; costUsd: number };

/**
 * One `claude -p` call's stream-json: its usage summed over every assistant turn, the last session
 * id it names, and whether it printed a result message.
 */
export type CallStream = { usage: Usage; sessionId?: string; result: boolean };

type TurnUsage = {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
};

type StreamMessage = {
  type?: string;
  session_id?: unknown;
  total_cost_usd?: unknown;
  message?: { usage?: TurnUsage };
};

export const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, turns: 0, costUsd: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    turns: a.turns + b.turns,
    costUsd: a.costUsd + b.costUsd,
  };
}

/**
 * Reads a call's stream-json lines: every assistant message's `message.usage` is one turn, and the
 * `result` message's `total_cost_usd` is the call's cost. Lines that aren't JSON are skipped.
 */
export function parseCall(lines: string[]): CallStream {
  let usage = NO_USAGE;
  let sessionId: string | undefined;
  let result = false;
  for (const line of lines) {
    let message: StreamMessage;
    try {
      message = JSON.parse(line) as StreamMessage;
    } catch {
      continue;
    }
    if (typeof message.session_id === "string") sessionId = message.session_id;
    const turn = message.type === "assistant" ? message.message?.usage : undefined;
    if (turn) {
      const input = (turn.input_tokens ?? 0) + (turn.cache_creation_input_tokens ?? 0) + (turn.cache_read_input_tokens ?? 0);
      usage = addUsage(usage, { inputTokens: input, outputTokens: turn.output_tokens ?? 0, turns: 1, costUsd: 0 });
    }
    if (message.type === "result") result = true;
    if (message.type === "result" && typeof message.total_cost_usd === "number") {
      usage = addUsage(usage, { ...NO_USAGE, costUsd: message.total_cost_usd });
    }
  }
  return { usage, sessionId, result };
}
