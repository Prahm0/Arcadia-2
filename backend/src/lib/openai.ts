import type { Env } from "../types";

/** A piece of a multimodal message: text, an image, or a PDF. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_call_id?: string;
}

/**
 * How Arcad sounds everywhere: chat, session plans, anything it writes.
 * Short, casual, specific, and it plans the work rather than doing it.
 */
export const ARCAD_VOICE = [
  "You are Arcad, the study planner inside Arcadia, for high school students.",
  "Talk like a sharp mate who's good at school. Casual Australian English. Australian spelling.",
  "One to three short sentences. No paragraphs, no headings, no filler. Use a list only for steps, and never more than three.",
  "No pep talks, no \"Great question!\", no emojis.",
  "You plan the work; you never do it. Don't write essays, paragraphs, answers, solutions or code for schoolwork, and don't answer assessment or homework questions. You can say what to study, why now, and how to go about it, and give a one-line nudge on a concept. If they ask you to do the work, say so in one line and turn it into a plan: what to do, in what order, for how long.",
  "Always tie advice to their real stuff: deadlines, syllabus topics, what they did last session. Never invent tasks, topics or deadlines they haven't given you.",
].join("\n");

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

/** True when Arcad can actually call the model. */
export function aiConfigured(env: Env): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

interface RequestOptions {
  tools?: Tool[];
  /** Hard cap on reply length. Chat keeps this small so Arcad can't ramble. */
  maxTokens?: number;
  temperature?: number;
  /** Structured output: the reply must match this JSON schema. */
  schema?: { name: string; schema: Record<string, unknown> };
  /** Overrides OPENAI_MODEL for this request. */
  model?: string;
  /** How hard a reasoning model thinks. Ignored by other models. */
  reasoningEffort?: "low" | "medium" | "high";
}

/** Reasoning models take no temperature and count tokens differently. */
function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/.test(model) && !model.includes("chat");
}

/** The model Arcad lays schedules out with: worth a stronger one than chat. */
export function planModel(env: Env): string {
  return env.OPENAI_PLAN_MODEL || env.OPENAI_MODEL || "gpt-4o-mini";
}

async function request(env: Env, messages: ChatMessage[], options: RequestOptions) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("Arcad isn't set up yet.");
  }

  // OPENAI_BASE_URL only exists so local dev can point at a stand-in server.
  const base = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const tools = options.tools ?? [];
  const model = options.model || env.OPENAI_MODEL || "gpt-4o-mini";
  const reasoning = isReasoningModel(model);
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      ...(reasoning
        ? {
            max_completion_tokens: options.maxTokens ?? 250,
            ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
          }
        : { temperature: options.temperature ?? 0.4, max_tokens: options.maxTokens ?? 250 }),
      ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      ...(options.schema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: options.schema.name, strict: true, schema: options.schema.schema },
            },
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[openai] request failed", response.status, detail.slice(0, 500));
    throw new Error(
      response.status === 429 ? "Arcad's flat out right now. Try again in a sec." : "Arcad couldn't respond.",
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
  return data.choices?.[0]?.message;
}

export async function complete(
  env: Env,
  messages: ChatMessage[],
  tools: Tool[] = [PROPOSE_TOOL],
): Promise<Completion> {
  const message = await request(env, messages, { tools, maxTokens: 250 });
  return {
    content: message?.content ?? "",
    toolCalls: (message?.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    })),
  };
}

/**
 * A reply shaped by a JSON schema, parsed. Returns null if the model came
 * back with something unparseable, so callers can fall back.
 */
export async function completeJson<T>(
  env: Env,
  messages: ChatMessage[],
  schema: { name: string; schema: Record<string, unknown> },
  maxTokens = 600,
  options: Pick<RequestOptions, "model" | "reasoningEffort"> = {},
): Promise<T | null> {
  const message = await request(env, messages, { schema, maxTokens, temperature: 0.3, ...options });
  try {
    return JSON.parse(message?.content ?? "") as T;
  } catch {
    console.error("[openai] unparseable structured reply");
    return null;
  }
}
