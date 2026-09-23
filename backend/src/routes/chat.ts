import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { saveMemories } from "../lib/memories";
import { ARCAD_VOICE, PROPOSE_TOOL, REMEMBER_TOOL, complete, type ChatMessage } from "../lib/openai";
import { replan } from "../lib/replan";
import { subjectKey, weeklyTargetMinutes } from "../lib/scheduler";
import { describeBrief, recentMissReasonContext, subjectBriefs } from "../lib/study-context";
import { DAILY_MESSAGE_CAP, isValidTier, tryConsumeMessage } from "../lib/tiers";
import { DAY, iso, parseClock } from "../lib/time";
import type { Env, Variables } from "../types";

const chat = new Hono<{ Bindings: Env; Variables: Variables }>();

const PROPOSAL_TTL = 2 * DAY;

function serialiseMessage(row: typeof schema.messages.$inferSelect) {
  return {
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    createdAt: iso(row.createdAt),
  };
}

function serialiseProposal(row: typeof schema.proposals.$inferSelect) {
  return {
    id: row.id,
    summary: row.summary,
    status: row.status,
    operations: JSON.parse(row.operations) as unknown[],
    createdAt: iso(row.createdAt),
    expiresAt: iso(row.expiresAt),
  };
}

/** Most recent conversation, or a fresh one. */
async function currentConversation(env: Env, userId: string) {
  const database = db(env.DB);
  const [existing] = await database
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, userId))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(1);
  if (existing) return existing;

  const id = newId("cnv");
  await database.insert(schema.conversations).values({ id, userId, title: null });
  const [created] = await database
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .limit(1);
  return created;
}

chat.get("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const conversation = await currentConversation(c.env, userId);

  const messageRows = await database
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversation.id))
    .orderBy(asc(schema.messages.createdAt))
    .limit(200);

  const proposalRows = await database
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.userId, userId), eq(schema.proposals.status, "pending")));

  return c.json({
    conversationId: conversation.id,
    messages: messageRows.map(serialiseMessage),
    proposals: proposalRows.map(serialiseProposal),
  });
});

chat.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req
    .json<{ message?: string; conversationId?: string | null }>()
    .catch(() => null);

  const text = String(body?.message ?? "").trim();
  if (!text) return c.json({ error: "Say something first." }, 422);
  if (text.length > 4000) return c.json({ error: "That message is too long." }, 422);

  const database = db(c.env.DB);

  // Look up the sender's tier and consume a message from today's quota.
  // We do this before writing the user message so a rejected send leaves
  // no half-persisted turn in the conversation.
  const [userRow] = await database
    .select({ tier: schema.users.tier })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const tier = isValidTier(userRow?.tier) ? userRow.tier : "free";
  const cap = await tryConsumeMessage(database, userId, tier);
  if (!cap.allowed) {
    return c.json(
      {
        error:
          tier === "free"
            ? `You've used your ${DAILY_MESSAGE_CAP.free} free messages for today. Upgrade to Pro for ${DAILY_MESSAGE_CAP.pro}/day.`
            : `You've hit today's cap of ${cap.cap} Arcad messages. Resets at midnight UTC.`,
        code: "message_cap_reached",
        tier,
        cap: cap.cap,
        used: cap.used,
      },
      429,
    );
  }

  let conversation:
    | typeof schema.conversations.$inferSelect
    | undefined;
  if (body?.conversationId) {
    const [found] = await database
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, body.conversationId),
          eq(schema.conversations.userId, userId),
        ),
      )
      .limit(1);
    conversation = found;
  }
  if (!conversation) conversation = await currentConversation(c.env, userId);

  const userMessageId = newId("msg");
  await database.insert(schema.messages).values({
    id: userMessageId,
    conversationId: conversation.id,
    userId,
    role: "user",
    content: text,
  });

  if (!conversation.title) {
    await database
      .update(schema.conversations)
      .set({ title: text.slice(0, 60) })
      .where(eq(schema.conversations.id, conversation.id));
  }

  const conversationId = conversation.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const history = await database
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.conversationId, conversationId))
          .orderBy(asc(schema.messages.createdAt))
          .limit(30);

        const context = await buildContext(c.env, userId);
        const prompt: ChatMessage[] = [
          { role: "system", content: context.text },
          ...history.map((row) => ({
            role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: row.content,
          })),
        ];

        const result = await complete(
          c.env,
          prompt,
          context.memoryEnabled ? [PROPOSE_TOOL, REMEMBER_TOOL] : [PROPOSE_TOOL],
        );

        // Memories save straight away (no approval step); the student sees
        // them in the chat and can delete them from their profile.
        let remembered: string[] = [];
        const rememberCall = context.memoryEnabled
          ? result.toolCalls.find((call) => call.name === "remember")
          : undefined;
        if (rememberCall) {
          try {
            const parsed = JSON.parse(rememberCall.arguments) as { facts?: unknown };
            const saved = await saveMemories(
              database,
              userId,
              Array.isArray(parsed.facts) ? parsed.facts : [],
            );
            remembered = saved.map((memory) => memory.content);
          } catch (error) {
            console.error("[chat] bad remember arguments", error);
          }
        }

        let proposalPayload: ReturnType<typeof serialiseProposal> | undefined;
        const toolCall = result.toolCalls.find((call) => call.name === "propose_changes");

        if (toolCall) {
          try {
            const parsed = JSON.parse(toolCall.arguments) as {
              summary?: string;
              operations?: unknown[];
            };
            const operations = Array.isArray(parsed.operations) ? parsed.operations : [];
            if (operations.length > 0) {
              const id = newId("prp");
              const expiresAt = Date.now() + PROPOSAL_TTL;
              await database.insert(schema.proposals).values({
                id,
                userId,
                conversationId,
                summary: String(parsed.summary ?? "Update your plan").slice(0, 400),
                operations: JSON.stringify(operations).slice(0, 20000),
                expiresAt,
              });
              const [row] = await database
                .select()
                .from(schema.proposals)
                .where(eq(schema.proposals.id, id))
                .limit(1);
              if (row) proposalPayload = serialiseProposal(row);
            }
          } catch (error) {
            console.error("[chat] bad tool arguments", error);
          }
        }

        const content =
          result.content.trim() ||
          (proposalPayload
            ? `${proposalPayload.summary} Hit Apply and I'll update your plan.`
            : remembered.length > 0
              ? "Sweet, I'll remember that."
              : "Not sure what you're after. What do you need to plan?");

        const assistantId = newId("msg");
        await database.insert(schema.messages).values({
          id: assistantId,
          conversationId,
          userId,
          role: "assistant",
          content,
        });
        await database
          .update(schema.conversations)
          .set({ updatedAt: Date.now() })
          .where(eq(schema.conversations.id, conversationId));

        send({
          type: "message",
          conversationId,
          message: {
            id: assistantId,
            role: "assistant",
            content,
            createdAt: new Date().toISOString(),
          },
          ...(proposalPayload ? { proposal: proposalPayload } : {}),
          ...(remembered.length > 0 ? { remembered } : {}),
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Arcad couldn't respond.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
});

/**
 * A compact snapshot of the student and their plan, so Arcad answers about
 * real data: their profile, goals, subjects (with their own notes), what
 * they've asked Arcad to know and how to respond, and saved memories.
 */
async function buildContext(
  env: Env,
  userId: string,
): Promise<{ text: string; memoryEnabled: boolean }> {
  const database = db(env.DB);
  const [[profile], taskRows, commitmentRows, subjectRows, goalRows, memoryRows] =
    await Promise.all([
      database.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1),
      database
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.status, "pending"))),
      database.select().from(schema.commitments).where(eq(schema.commitments.userId, userId)),
      database.select().from(schema.subjects).where(eq(schema.subjects.userId, userId)),
      database.select().from(schema.goals).where(eq(schema.goals.userId, userId)),
      database
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.userId, userId))
        .orderBy(asc(schema.memories.createdAt)),
    ]);

  const [briefs, missReasonContext] = await Promise.all([
    subjectBriefs(database, userId, profile?.timezone ?? "Australia/Brisbane"),
    recentMissReasonContext(database, userId),
  ]);
  const memoryEnabled = profile?.memoryEnabled ?? true;
  const about = profile?.arcadAbout.trim() ?? "";
  const style = profile?.arcadStyle.trim() ?? "";
  const who = [
    profile?.displayName,
    profile?.grade,
    [profile?.school, profile?.state, profile?.country].filter(Boolean).join(", "),
  ].filter(Boolean);
  const openGoals = goalRows.filter((goal) => !goal.done);

  const lines = [
    ARCAD_VOICE,
    "In this chat you help them plan: what to work on, when, and what's coming up. To change the plan, call propose_changes. Never claim you've changed something without it.",
    ...(memoryEnabled
      ? [
          "When the student tells you something about themselves that will still matter later (how they study, what they find hard, goals, how their week works), call remember as well as replying.",
        ]
      : []),
    "",
    `Now: ${new Date().toISOString()}`,
    `Timezone: ${profile?.timezone ?? "Australia/Brisbane"}`,
    `Wake ${profile?.wakeTime ?? "07:00"}, bed ${profile?.bedtime ?? "22:30"}, up to ${
      profile?.maxDailyStudyMinutes ?? 180
    } minutes of study a day in ${profile?.preferredSessionMinutes ?? 50} minute sessions.`,
    ...(who.length ? [`Student: ${who.join(" · ")}`] : []),
    "",
    "Goals:",
    ...(profile?.atarTarget ? [`- ATAR target ${profile.atarTarget.toFixed(2)}`] : []),
    ...openGoals.map((goal) => `- ${goal.title}`),
    ...(!profile?.atarTarget && openGoals.length === 0 ? ["- none set"] : []),
    "",
    "Subjects and weekly study targets (the scheduler tops each one up across the week):",
    ...(subjectRows.length
      ? subjectRows.map(
          (subject) =>
            `- ${subject.name}: ${weeklyTargetMinutes(subject, profile?.grade)} minutes a week${
              subject.weeklyMinutes === null ? " (suggested default)" : ""
            }${subject.targetGrade ? `, aiming for ${subject.targetGrade}` : ""}${
              subject.notes.trim() ? `. Their note: ${subject.notes.trim()}` : ""
            }${(() => {
              const course = describeBrief(briefs.get(subjectKey(subject.name)));
              return course ? `. ${course}` : "";
            })()}`,
        )
      : ["- none"]),
    "",
    ...(missReasonContext.length
      ? [
          "Recent self-reported reasons for missed study blocks (last 30 days):",
          ...missReasonContext.map((pattern) => `- ${pattern}`),
          "Use these patterns gently. Suggest adjustments or ask before changing the plan, and never shame the student for missing a block.",
          "",
        ]
      : []),
    // The student wrote these about themselves. They shape tone and advice,
    // but don't override the rules at the top.
    ...(about ? ["What the student wants you to know about them:", about, ""] : []),
    ...(style ? ["How the student wants you to respond:", style, ""] : []),
    ...(memoryEnabled && memoryRows.length
      ? ["What you've remembered about the student:", ...memoryRows.map((memory) => `- ${memory.content}`), ""]
      : []),
    "Open tasks:",
    ...(taskRows.length
      ? taskRows.map(
          (task) =>
            `- [${task.id}] ${task.title}${task.subject ? ` (${task.subject})` : ""}, due ${iso(
              task.dueAt,
            )}, ${Math.max(0, task.estimatedMinutes - task.completedMinutes)} minutes left`,
        )
      : ["- none"]),
    "",
    "Recurring commitments:",
    ...(commitmentRows.length
      ? commitmentRows.map(
          (commitment) =>
            `- [${commitment.id}] ${commitment.title}, ${commitment.recurrence}${
              commitment.weekday !== null ? ` weekday ${commitment.weekday}` : ""
            }, ${commitment.startTime}-${commitment.endTime}`,
        )
      : ["- none"]),
  ];

  return { text: lines.join("\n"), memoryEnabled };
}

/** Conversation list and history. */
export const conversations = new Hono<{ Bindings: Env; Variables: Variables }>();

conversations.get("/", async (c) => {
  const { userId } = c.get("session");
  const rows = await db(c.env.DB)
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, userId))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(50);

  return c.json({
    conversations: rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),
  });
});

conversations.post("/", async (c) => {
  const { userId } = c.get("session");
  const id = newId("cnv");
  const database = db(c.env.DB);
  await database.insert(schema.conversations).values({ id, userId, title: null });
  const [row] = await database
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .limit(1);

  return c.json(
    {
      conversation: {
        id: row.id,
        title: row.title,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      },
    },
    201,
  );
});

conversations.get("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const database = db(c.env.DB);

  const [conversation] = await database
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
    .limit(1);
  if (!conversation) return c.json({ error: "Conversation not found." }, 404);

  const messageRows = await database
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, id))
    .orderBy(asc(schema.messages.createdAt))
    .limit(200);

  return c.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: iso(conversation.createdAt),
      updatedAt: iso(conversation.updatedAt),
    },
    messages: messageRows.map(serialiseMessage),
  });
});

/** Accepting or declining what Arcad proposed. */
export const proposals = new Hono<{ Bindings: Env; Variables: Variables }>();

proposals.post("/:id/:action", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const action = c.req.param("action");
  if (action !== "apply" && action !== "decline") {
    return c.json({ error: "Unknown action." }, 404);
  }

  const database = db(c.env.DB);
  const [proposal] = await database
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.userId, userId)))
    .limit(1);
  if (!proposal) return c.json({ error: "Proposal not found." }, 404);
  if (proposal.status !== "pending") return c.json({ error: "Already resolved." }, 409);
  if (proposal.expiresAt < Date.now()) {
    await database
      .update(schema.proposals)
      .set({ status: "expired" })
      .where(eq(schema.proposals.id, id));
    return c.json({ error: "That suggestion has expired." }, 410);
  }

  if (action === "decline") {
    await database
      .update(schema.proposals)
      .set({ status: "declined" })
      .where(eq(schema.proposals.id, id));
    return c.json({ ok: true });
  }

  const operations = JSON.parse(proposal.operations) as Array<Record<string, unknown>>;
  const applied = await applyOperations(c.env, userId, operations);

  await database
    .update(schema.proposals)
    .set({ status: "applied" })
    .where(eq(schema.proposals.id, id));

  await replan(database, userId);
  return c.json({ ok: true, applied });
});

async function applyOperations(
  env: Env,
  userId: string,
  operations: Array<Record<string, unknown>>,
): Promise<number> {
  const database = db(env.DB);
  let applied = 0;

  for (const operation of operations.slice(0, 50)) {
    const op = String(operation.op ?? "");
    const str = (key: string) =>
      typeof operation[key] === "string" ? (operation[key] as string) : undefined;
    const num = (key: string) =>
      Number.isFinite(Number(operation[key])) ? Number(operation[key]) : undefined;

    if (op === "create_task") {
      const title = str("title")?.trim();
      const dueAt = Date.parse(str("dueAt") ?? "");
      if (!title || Number.isNaN(dueAt)) continue;
      await database.insert(schema.tasks).values({
        id: newId("tsk"),
        userId,
        title: title.slice(0, 200),
        subject: str("subject") ?? null,
        taskType: str("taskType") ?? "study",
        dueAt,
        estimatedMinutes: Math.min(1200, Math.max(15, num("estimatedMinutes") ?? 60)),
        priority: Math.min(5, Math.max(1, num("priority") ?? 2)),
      });
      applied += 1;
    } else if (op === "update_task") {
      const taskId = str("id");
      if (!taskId) continue;
      const patch: Partial<typeof schema.tasks.$inferInsert> = {};
      if (str("title")) patch.title = str("title")!.slice(0, 200);
      if (str("subject") !== undefined) patch.subject = str("subject") ?? null;
      const dueAt = Date.parse(str("dueAt") ?? "");
      if (!Number.isNaN(dueAt)) patch.dueAt = dueAt;
      if (num("estimatedMinutes") !== undefined) {
        patch.estimatedMinutes = Math.min(1200, Math.max(15, num("estimatedMinutes")!));
      }
      if (Object.keys(patch).length === 0) continue;
      await database
        .update(schema.tasks)
        .set(patch)
        .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.userId, userId)));
      applied += 1;
    } else if (op === "delete_task") {
      const taskId = str("id");
      if (!taskId) continue;
      await database
        .delete(schema.events)
        .where(and(eq(schema.events.userId, userId), eq(schema.events.taskId, taskId)));
      await database
        .delete(schema.tasks)
        .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.userId, userId)));
      applied += 1;
    } else if (op === "create_commitment") {
      const title = str("title")?.trim();
      const startTime = str("startTime");
      const endTime = str("endTime");
      if (!title || parseClock(startTime) === null || parseClock(endTime) === null) continue;
      await database.insert(schema.commitments).values({
        id: newId("cmt"),
        userId,
        title: title.slice(0, 200),
        category: str("category") ?? "other",
        recurrence: str("recurrence") ?? "weekly",
        weekday: num("weekday") ?? null,
        startTime: startTime!,
        endTime: endTime!,
      });
      applied += 1;
    } else if (op === "delete_commitment") {
      const commitmentId = str("id");
      if (!commitmentId) continue;
      await database
        .delete(schema.events)
        .where(
          and(eq(schema.events.userId, userId), eq(schema.events.commitmentId, commitmentId)),
        );
      await database
        .delete(schema.commitments)
        .where(
          and(eq(schema.commitments.id, commitmentId), eq(schema.commitments.userId, userId)),
        );
      applied += 1;
    }
  }

  return applied;
}

export default chat;
