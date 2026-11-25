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
  message?: { id?: unknown; usage?: TurnUsage };
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
 * `result` message's `total_cost_usd` is the call's cost. Claude Code prints a line per content
 * block of a message, each with the message's usage so far, so lines sharing a `message.id` are
 * one turn whose usage is the largest of each field on any of its lines. Lines that aren't JSON
 * are skipped.
 */
export function parseCall(lines: string[]): CallStream {
  let usage = NO_USAGE;
  let sessionId: string | undefined;
  let result = false;
  // Each turn's usage, by message id; a line without an id is a turn of its own.
  const turns = new Map<unknown, Required<TurnUsage>>();
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
      const id = message.message?.id ?? Symbol();
      const before = turns.get(id);
      const max = (field: keyof TurnUsage) => Math.max(before?.[field] ?? 0, turn[field] ?? 0);
      turns.set(id, {
        input_tokens: max("input_tokens"),
        cache_creation_input_tokens: max("cache_creation_input_tokens"),
        cache_read_input_tokens: max("cache_read_input_tokens"),
        output_tokens: max("output_tokens"),
      });
    }
    if (message.type === "result") result = true;
    if (message.type === "result" && typeof message.total_cost_usd === "number") {
      usage = addUsage(usage, { ...NO_USAGE, costUsd: message.total_cost_usd });
    }
  }
  for (const turn of turns.values()) {
    const input = turn.input_tokens + turn.cache_creation_input_tokens + turn.cache_read_input_tokens;
    usage = addUsage(usage, { inputTokens: input, outputTokens: turn.output_tokens, turns: 1, costUsd: 0 });
  }
  return { usage, sessionId, result };
}
