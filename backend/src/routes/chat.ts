import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { saveMemories } from "../lib/memories";
import { ARCAD_VOICE, PROPOSE_TOOL, REMEMBER_TOOL, complete, proposeChanges, type ChatMessage, type ProposedChanges } from "../lib/openai";
import { applyOperations, prepareOperations, scheduleContext } from "../lib/plan-changes";
import { replan } from "../lib/replan";
import { commitmentBuffers, skipDates, subjectKey, weeklyTargetMinutes } from "../lib/scheduler";
import { describeBrief, recentMissReasonContext, subjectBriefs } from "../lib/study-context";
import { DAILY_MESSAGE_CAP, getMessageUsage, getUserTier, messageUsageSnapshot, refundMessage, tryConsumeMessage } from "../lib/tiers";
import { DAY, iso, localDateKey } from "../lib/time";
import type { Env, Variables } from "../types";

const chat = new Hono<{ Bindings: Env; Variables: Variables }>();

const PROPOSAL_TTL = 2 * DAY;
const MAX_MESSAGE_LENGTH = 16_000;

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

/**
 * Every proposal made in a conversation, whatever became of it, so the chat
 * can show each one under the reply that made it.
 */
async function conversationProposals(env: Env, userId: string, conversationId: string) {
  const rows = await db(env.DB)
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.userId, userId), eq(schema.proposals.conversationId, conversationId)))
    .orderBy(asc(schema.proposals.createdAt));
  return rows.map(serialiseProposal);
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
    conversationProposals: await conversationProposals(c.env, userId, conversation.id),
  });
});

chat.get("/usage", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const tier = await getUserTier(database, userId);
  return c.json(await getMessageUsage(database, userId, tier));
});

chat.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req
    .json<{ message?: string; conversationId?: string | null; newConversation?: boolean }>()
    .catch(() => null);

  const text = String(body?.message ?? "").trim();
  if (!text) return c.json({ error: "Say something first." }, 422);
  if (text.length > MAX_MESSAGE_LENGTH) {
    return c.json(
      {
        error:
          "That message is very long. Try pasting a smaller section and Arcad will work through it.",
      },
      422,
    );
  }

  const database = db(c.env.DB);

  // Look up the sender's tier and consume a message from today's quota.
  // We do this before writing the user message so a rejected send leaves
  // no half-persisted turn in the conversation.
  const tier = await getUserTier(database, userId);
  const cap = await tryConsumeMessage(database, userId, tier);
  if (!cap.allowed) {
    return c.json(
      {
        error:
          tier === "free"
            ? `You've used your ${DAILY_MESSAGE_CAP.free} free messages for today. Resets at midnight.`
            : tier === "pro"
              ? `You've used your ${DAILY_MESSAGE_CAP.pro} Pro messages for today. Resets at midnight.`
            : `You've hit today's cap of ${cap.cap} Arcad messages. Resets at midnight.`,
        code: "message_cap_reached",
        tier,
        upgradeTier: tier === "free" ? "pro" : tier === "pro" ? "max" : null,
        cap: cap.cap,
        used: cap.used,
        usage: messageUsageSnapshot(tier, cap.used, cap.window),
      },
      429,
    );
  }

  let conversation:
    | typeof schema.conversations.$inferSelect
    | undefined;
  // A new chat only gets a row once its first message is sent, so opening
  // Arcad doesn't leave empty conversations behind.
  let createdConversation = false;
  if (body?.newConversation) {
    const id = newId("cnv");
    await database.insert(schema.conversations).values({ id, userId, title: null });
    [conversation] = await database
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, id))
      .limit(1);
    createdConversation = true;
  } else if (body?.conversationId) {
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
        // The latest 30, oldest first; rowid breaks ties within a second.
        // Taking the first 30 left Arcad answering an old message once a
        // chat ran past that.
        const history = (
          await database
            .select()
            .from(schema.messages)
            .where(eq(schema.messages.conversationId, conversationId))
            .orderBy(desc(schema.messages.createdAt), desc(sql`rowid`))
            .limit(30)
        ).reverse();

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
          { feature: "chat", userId },
        );
        if (!result.content.trim() && result.toolCalls.length === 0) {
          throw new Error("Arcad couldn't respond.");
        }

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
        // Changes Arcad wanted that don't fit the schedule, said plainly
        // rather than left for Apply to quietly skip.
        let problems: string[] = [];
        const toolCall = result.toolCalls.find((call) => call.name === "propose_changes");

        if (toolCall) {
          try {
            send({ type: "status", text: "Working out your changes" });
            const best = await workOutChanges(c.env, database, userId, prompt, toolCall.arguments);
            const parsed = best.proposed;
            const prepared = best.prepared;
            const operations = prepared.operations;
            problems = prepared.problems;
            if (operations.length > 0) {
              const id = newId("prp");
              const expiresAt = Date.now() + PROPOSAL_TTL;
              await database.insert(schema.proposals).values({
                id,
                userId,
                conversationId,
                summary: (parsed.summary.trim() || "Update your plan").slice(0, 400),
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

        const problem = problems[0] ?? "";
        const leftOut = problems.length > 1 ? `${problems.slice(0, 3).join("; ")}` : problem;
        const content = toolCall && !proposalPayload
          ? // Arcad's own words would describe a change that isn't coming.
            problem
            ? `I couldn't set that up: ${leftOut}. Want to try a different time?`
            : "I couldn't set that up. Which block do you mean, and when should it go?"
          : proposalPayload
            ? // The change card lists exactly what Apply does, so the reply
              // says that and anything left out, not the chat model's guess.
              [
                `${proposalPayload.summary} Tap Apply and it goes on your schedule.`,
                ...(problem ? [`I couldn't do ${problems.length > 1 ? "these bits" : "one bit"}: ${leftOut}.`] : []),
              ].join(" ")
            : result.content.trim() ||
              (remembered.length > 0 ? "Sweet, I'll remember that." : "Not sure what you're after. What do you need to plan?");

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
          usage: messageUsageSnapshot(tier, cap.used, cap.window),
          ...(proposalPayload ? { proposal: proposalPayload } : {}),
          ...(remembered.length > 0 ? { remembered } : {}),
        });
      } catch (error) {
        // The send was consumed up front so a rejected turn leaves no
        // half-written message. Since we never delivered a reply, hand the
        // message back so a failed send does not cost the student their quota.
        await refundMessage(database, userId, cap.day).catch((refundError) => {
          console.error("[chat] failed to refund an undelivered message", refundError);
        });
        // Take the question back out so a retry doesn't leave it in the
        // conversation twice, and drop a chat that never got going.
        await database
          .delete(schema.messages)
          .where(eq(schema.messages.id, userMessageId))
          .catch(() => undefined);
        if (createdConversation) {
          await database
            .delete(schema.conversations)
            .where(eq(schema.conversations.id, conversationId))
            .catch(() => undefined);
        }
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

  const timeZone = profile?.timezone ?? "Australia/Brisbane";
  const now = Date.now();
  const schedule = await scheduleContext(database, userId, timeZone, now);
  const localNow = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(now);

  const lines = [
    ARCAD_VOICE,
    "In this chat you help them plan: what to work on, when, and what's coming up.",
    "When they ask to change their schedule or plan, call propose_changes in the same reply. Use the block ids from their schedule below. To keep time free (busy, going out, work), add a one-off commitment for it rather than removing blocks, or the study just moves elsewhere. For more or less of a subject every week, use update_subject. If you can't tell which block or time they mean, ask.",
    "When they say what they'll work on and when (\"Self Monitoring Report until 9, then the Lab Report\"), add_block each one at exactly those times with the taskId from Open tasks, and remove_block the study blocks in that time.",
    "Never change when a class, sport or job happens unless they say it has moved for good. To keep a gap around one, use update_commitment with bufferBefore and bufferAfter. If it's different just today, skip_commitment for today and create_commitment with today's date and the real times.",
    "If they'll be up later or go to bed earlier one night, set_bedtime for that night.",
    "One message can need many changes. Put all of them in a single propose_changes call.",
    "A change only happens when they tap Apply, so say it's ready to apply. Never say you've already changed something.",
    ...(memoryEnabled
      ? [
          "When the student tells you something about themselves that will still matter later (how they study, what they find hard, goals, how their week works), call remember as well as replying.",
        ]
      : []),
    "",
    `Now: ${localNow} their time (${localDateKey(now, timeZone)}), timezone ${timeZone}`,
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
    ...schedule,
    "",
    "Commitments (weekday 0 = Sunday):",
    ...(() => {
      const today = localDateKey(now, timeZone);
      // One-offs that have passed (or never had a date) would read as
      // happening today.
      const current = commitmentRows.filter(
        (commitment) => commitment.recurrence !== "none" || (commitment.startDate !== null && commitment.startDate >= today),
      );
      return current.length
        ? current.map((commitment) => {
            const buffer = commitmentBuffers(commitment);
            const off = skipDates(commitment).filter((date) => date >= today);
            return `- [${commitment.id}] ${commitment.title}, ${
              commitment.recurrence === "none"
                ? `once on ${commitment.startDate}`
                : commitment.recurrence === "weekly"
                  ? `weekly on weekday ${commitment.weekday}`
                  : commitment.recurrence
            }, ${commitment.startTime}-${commitment.endTime}${
              buffer.before || buffer.after ? `, keeps ${buffer.before} min free before and ${buffer.after} min after` : ""
            }${off.length ? `, off on ${off.join(", ")}` : ""}`;
          })
        : ["- none"];
    })(),
  ];

  return { text: lines.join("\n"), memoryEnabled };
}

/** Conversation list and history. */
export const conversations = new Hono<{ Bindings: Env; Variables: Variables }>();

conversations.get("/", async (c) => {
  const { userId } = c.get("session");
  // Untitled means nothing was ever sent, so there's nothing to go back to.
  const rows = await db(c.env.DB)
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.userId, userId), isNotNull(schema.conversations.title)))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(100);

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
    proposals: await conversationProposals(c.env, userId, id),
  });
});

conversations.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const body = await c.req.json<{ title?: string }>().catch(() => null);
  const title = String(body?.title ?? "").trim().slice(0, 80);
  if (!title) return c.json({ error: "Give it a name first." }, 422);

  const database = db(c.env.DB);
  const [conversation] = await database
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
    .limit(1);
  if (!conversation) return c.json({ error: "Conversation not found." }, 404);

  await database.update(schema.conversations).set({ title }).where(eq(schema.conversations.id, id));
  return c.json({ ok: true, title });
});

conversations.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const database = db(c.env.DB);
  const [conversation] = await database
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
    .limit(1);
  if (!conversation) return c.json({ error: "Conversation not found." }, 404);

  // Suggestions nobody acted on go with the chat; applied ones already live in the plan.
  await database
    .delete(schema.proposals)
    .where(
      and(
        eq(schema.proposals.userId, userId),
        eq(schema.proposals.conversationId, id),
        eq(schema.proposals.status, "pending"),
      ),
    );
  await database.delete(schema.messages).where(eq(schema.messages.conversationId, id));
  await database.delete(schema.conversations).where(eq(schema.conversations.id, id));
  return c.json({ ok: true });
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
  const { applied, skipped } = await applyOperations(database, userId, operations);

  await database
    .update(schema.proposals)
    .set({ status: "applied" })
    .where(eq(schema.proposals.id, id));

  await replan(database, userId);
  return c.json({ ok: true, applied, skipped });
});

export default chat;

/** How many times the planning model gets its problems back to fix. */
const CHANGE_REPAIR_ROUNDS = 1;

/**
 * The plan changes to offer for the student's last message. The chat model
 * decided a change is wanted; the planning model works out the full set,
 * each attempt is checked against their real schedule, and anything that
 * can't happen goes back to it once to fix. The attempt that does the most
 * with the fewest problems wins. If the planning model fails, the chat
 * model's own proposal is used, as before.
 */
async function workOutChanges(
  env: Env,
  database: ReturnType<typeof db>,
  userId: string,
  prompt: ChatMessage[],
  chatArguments: string,
): Promise<{ proposed: ProposedChanges; prepared: Awaited<ReturnType<typeof prepareOperations>> }> {
  const fromChat = (): ProposedChanges => {
    try {
      const parsed = JSON.parse(chatArguments) as { summary?: unknown; operations?: unknown };
      return {
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
        operations: Array.isArray(parsed.operations) ? parsed.operations : [],
      };
    } catch {
      return { summary: "", operations: [] };
    }
  };
  const score = (prepared: Awaited<ReturnType<typeof prepareOperations>>) =>
    prepared.operations.length * 10 - prepared.problems.length;

  let best: { proposed: ProposedChanges; prepared: Awaited<ReturnType<typeof prepareOperations>> } | null = null;
  const messages: ChatMessage[] = [
    ...prompt,
    {
      role: "system",
      content:
        "Now call propose_changes with every change their last message asks for, in one call. Use the exact times they gave. Use ids from the context. For deadline work, add_block with the taskId of the open task.",
    },
  ];
  for (let round = 0; round <= CHANGE_REPAIR_ROUNDS; round++) {
    let proposed: ProposedChanges | null = null;
    try {
      proposed = await proposeChanges(env, messages, { feature: "chat_changes", userId });
    } catch (error) {
      console.error("[chat] planning model failed", error);
    }
    if (!proposed) break;
    const prepared = await prepareOperations(database, userId, proposed.operations);
    if (!best || score(prepared) > score(best.prepared)) best = { proposed, prepared };
    if (prepared.problems.length === 0) break;
    messages.push(
      { role: "assistant", content: `propose_changes ${JSON.stringify(proposed).slice(0, 6000)}` },
      {
        role: "system",
        content: [
          "Arcadia checked those changes against their real schedule. These parts can't happen:",
          ...prepared.problems.map((problem) => `- ${problem}`),
          "Fix them (a free time, the right id, a taskId from Open tasks, a date that hasn't passed) and call propose_changes again with the complete set, including the parts that worked. Leave out anything that truly can't be done.",
        ].join("\n"),
      },
    );
  }

  if (best && best.prepared.operations.length > 0) return best;
  const proposed = fromChat();
  const prepared = await prepareOperations(database, userId, proposed.operations);
  return best && score(best.prepared) >= score(prepared) ? best : { proposed, prepared };
}
