import { db, schema } from "../db";
import type { Env } from "../types";
import { newId } from "./ids";

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
  "Calm and on their side: never bossy, never guilt. No commands like \"Get on it!\" or \"No excuses\". End on the next concrete step, not a slogan.",
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

/** Which part of Arcadia made a call, as ai_usage records it. */
export type AiFeature =
  | "chat"
  | "day_layout"
  | "month_plan"
  | "session_plan"
  | "cards"
  | "sheet"
  | "syllabus"
  | "resource_summary";

/** Who a call was for, so its cost can be recorded. */
export interface UsageTag {
  feature: AiFeature;
  userId?: string | null;
}

interface RequestOptions {
  usage: UsageTag;
  tools?: Tool[];
  /** Hard cap on reply length. Chat keeps this small so Arcad can't ramble. */
  maxTokens?: number;
  temperature?: number;
  /** Structured output: the reply must match this JSON schema. */
  schema?: { name: string; schema: Record<string, unknown> };
  /** Overrides OPENAI_MODEL for this request. */
  model?: string;
  /** How hard a reasoning model thinks. Ignored by other models. */
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  /**
   * "flex" is half price but slower, and only runs when OpenAI has room.
   * For work nobody is waiting on. A busy flex falls back to the standard
   * tier, so it never costs the student the reply.
   */
  serviceTier?: "flex";
}

/** Reasoning models take no temperature and count tokens differently. */
export function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/.test(model) && !model.includes("chat");
}

/** The model Arcad lays schedules out with: worth a stronger one than chat. */
export function planModel(env: Env): string {
  return env.OPENAI_PLAN_MODEL || env.OPENAI_MODEL || "gpt-4o-mini";
}

/**
 * The model that reads students' files and writes from them (course maps,
 * resource notes, cards, sheets). gpt-4o-mini bills every image and PDF page
 * at about gpt-4o's price; gpt-5-mini reads the same page for a small
 * fraction of that, and is the stronger reader. Use it at minimal effort.
 */
export function documentModel(env: Env): string {
  return env.OPENAI_DOCUMENT_MODEL || "gpt-5-mini";
}

/**
 * Options for a call that reads or writes from a student's material. `reply`
 * is the longest answer expected; a reasoning model's thinking counts against
 * the same cap, so it gets room on top.
 */
export function documentCall(
  env: Env,
  usage: UsageTag,
  reply: number,
): { maxTokens: number; options: Pick<RequestOptions, "usage" | "model" | "reasoningEffort"> } {
  const model = documentModel(env);
  return isReasoningModel(model)
    ? { maxTokens: reply + 2000, options: { usage, model, reasoningEffort: "minimal" } }
    : { maxTokens: reply, options: { usage, model } };
}

/**
 * US dollars per million tokens: input, cached input, output. Flex is half.
 * Only for the ai_usage estimate; OpenAI's invoice is the real figure.
 */
const PRICES: Record<string, [number, number, number]> = {
  "gpt-5": [1.25, 0.125, 10],
  "gpt-5-mini": [0.25, 0.025, 2],
  "gpt-5-nano": [0.05, 0.005, 0.4],
  "gpt-4o-mini": [0.15, 0.075, 0.6],
  "gpt-4.1-mini": [0.4, 0.1, 1.6],
};

/**
 * Flex answers when OpenAI has room, which can mean a wait. Past this the
 * call goes to the standard tier. With the backoff below, a layout's later
 * calls then skip flex, so all three still fit in the cron's 15 minutes.
 */
const FLEX_TIMEOUT_MS = 5 * 60_000;
/** After flex turns a call away it's likely still busy, so skip it a while. */
const FLEX_BACKOFF_MS = 10 * 60_000;
let flexBusyUntil = 0;

interface ProviderUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

/** Saves what a call used. Never fails the call it's recording. */
async function recordUsage(
  env: Env,
  tag: UsageTag,
  model: string,
  serviceTier: string | null,
  usage: ProviderUsage | undefined,
) {
  if (!usage) return;
  const input = usage.prompt_tokens ?? 0;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  const price = PRICES[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
  // Per-million prices times tokens is already millionths of a dollar.
  const costMicros = price
    ? Math.round(((input - cached) * price[0] + cached * price[1] + output * price[2]) * (serviceTier === "flex" ? 0.5 : 1))
    : null;
  try {
    await db(env.DB)
      .insert(schema.aiUsage)
      .values({
        id: newId("aiu"),
        userId: tag.userId ?? null,
        feature: tag.feature,
        model,
        serviceTier,
        inputTokens: input,
        cachedTokens: cached,
        outputTokens: output,
        reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
        costMicros,
      });
  } catch (err) {
    console.error("[openai] couldn't record usage", err);
  }
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
  const body = {
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
  };
  const send = (serviceTier?: "flex") =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(serviceTier ? { ...body, service_tier: serviceTier } : body),
      signal: serviceTier ? AbortSignal.timeout(FLEX_TIMEOUT_MS) : undefined,
    });

  let response: Response | null = null;
  if (options.serviceTier && Date.now() >= flexBusyUntil) {
    try {
      response = await send(options.serviceTier);
      if (!response.ok && (response.status === 429 || response.status >= 500)) {
        const detail = await response.text().catch(() => "");
        console.warn(`[openai] ${options.serviceTier} unavailable, using the standard tier`, response.status, detail.slice(0, 200));
        response = null;
      }
    } catch (err) {
      console.warn(`[openai] ${options.serviceTier} didn't answer, using the standard tier`, err);
      response = null;
    }
    if (!response) flexBusyUntil = Date.now() + FLEX_BACKOFF_MS;
  }
  response ??= await send();

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
    usage?: ProviderUsage;
    service_tier?: string;
  };
  await recordUsage(env, options.usage, model, data.service_tier ?? null, data.usage);
  return data.choices?.[0]?.message;
}

export async function complete(
  env: Env,
  messages: ChatMessage[],
  tools: Tool[],
  usage: UsageTag,
): Promise<Completion> {
  const message = await request(env, messages, { tools, maxTokens: 250, usage });
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
  maxTokens: number,
  options: Pick<RequestOptions, "usage" | "model" | "reasoningEffort" | "serviceTier">,
): Promise<T | null> {
  const message = await request(env, messages, { schema, maxTokens, temperature: 0.3, ...options });
  try {
    return JSON.parse(message?.content ?? "") as T;
  } catch {
    console.error("[openai] unparseable structured reply");
    return null;
  }
}
