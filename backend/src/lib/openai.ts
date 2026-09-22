import type { Env } from "../types";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Completion {
  content: string;
  toolCalls: ToolCall[];
}

/** The one tool Arcad may call. Everything it changes goes via a proposal. */
export const PROPOSE_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_changes",
    description:
      "Propose changes to the student's plan. The student reviews and approves them before anything is applied. Use for adding, editing or removing tasks and commitments.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "One sentence describing the change, addressed to the student.",
        },
        operations: {
          type: "array",
          description: "The changes to apply if the student accepts.",
          items: {
            type: "object",
            properties: {
              op: {
                type: "string",
                enum: [
                  "create_task",
                  "update_task",
                  "delete_task",
                  "create_commitment",
                  "delete_commitment",
                ],
              },
              id: { type: "string", description: "Existing record id, for update and delete." },
              title: { type: "string" },
              subject: { type: "string" },
              taskType: { type: "string" },
              dueAt: { type: "string", description: "ISO 8601 timestamp." },
              estimatedMinutes: { type: "number" },
              priority: { type: "number" },
              category: { type: "string" },
              recurrence: { type: "string", enum: ["none", "daily", "weekly", "weekdays"] },
              weekday: { type: "number" },
              startTime: { type: "string", description: "HH:MM" },
              endTime: { type: "string", description: "HH:MM" },
            },
            required: ["op"],
          },
        },
      },
      required: ["summary", "operations"],
    },
  },
};

/**
 * Saves lasting facts about the student, the way ChatGPT's memory does.
 * Unlike plan changes this needs no approval: memories only shape how Arcad
 * talks and plans, and the student can see and delete every one on their
 * profile. Only offered when the student has memory switched on.
 */
export const REMEMBER_TOOL = {
  type: "function" as const,
  function: {
    name: "remember",
    description:
      "Save facts about the student that will still matter in future chats: study preferences, strengths and weak spots, goals, how their week works, how they like to be spoken to. Don't save one-off requests, anything already in the context, or sensitive details (health, family matters, passwords, addresses). Still reply to the student normally.",
    parameters: {
      type: "object",
      properties: {
        facts: {
          type: "array",
          description: "Each fact is one short sentence about the student, in the third person.",
          items: { type: "string" },
        },
      },
      required: ["facts"],
    },
  },
};

export type Tool = typeof PROPOSE_TOOL | typeof REMEMBER_TOOL;

export async function complete(
  env: Env,
  messages: ChatMessage[],
  tools: Tool[] = [PROPOSE_TOOL],
): Promise<Completion> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("The assistant is not configured yet.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.4,
      max_tokens: 700,
      ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[openai] request failed", response.status, detail.slice(0, 500));
    throw new Error(
      response.status === 429
        ? "Arcad is busy right now. Try again in a moment."
        : "Arcad couldn't respond.",
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    }>;
  };

  const message = data.choices?.[0]?.message;
  return {
    content: message?.content ?? "",
    toolCalls: (message?.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    })),
  };
}
