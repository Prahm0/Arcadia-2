import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { serialiseEvent } from "../lib/serialise";
import type { Env, Variables } from "../types";

const events = new Hono<{ Bindings: Env; Variables: Variables }>();

events.post("/:id/outcome", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const body = await c.req.json<{ outcome?: string }>().catch(() => null);
  const outcome = body?.outcome;

  if (outcome !== "completed" && outcome !== "missed" && outcome !== "planned") {
    return c.json({ error: "Unknown outcome." }, 422);
  }

  const database = db(c.env.DB);
  const [event] = await database
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.id, id), eq(schema.events.userId, userId)))
    .limit(1);
  if (!event) return c.json({ error: "Event not found." }, 404);

  await database
    .update(schema.events)
    .set({
      outcome,
      status: outcome === "planned" ? "planned" : outcome,
      // Marking an outcome pins the block so re-planning does not discard it.
      pinned: outcome !== "planned",
    })
    .where(eq(schema.events.id, id));

  // Completing a study block credits the task it belongs to.
  if (event.taskId) {
    const [task] = await database
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, event.taskId))
      .limit(1);

    if (task) {
      const blockMinutes = Math.round((event.endAt - event.startAt) / 60000);
      const wasCounted = event.outcome === "completed";
      const nowCounted = outcome === "completed";
      let completed = task.completedMinutes;
      if (!wasCounted && nowCounted) completed += blockMinutes;
      if (wasCounted && !nowCounted) completed -= blockMinutes;
      completed = Math.max(0, Math.min(task.estimatedMinutes, completed));

      await database
        .update(schema.tasks)
        .set({
          completedMinutes: completed,
          status: completed >= task.estimatedMinutes ? "complete" : "pending",
        })
        .where(eq(schema.tasks.id, task.id));
    }
  }

  const [updated] = await database
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, id))
    .limit(1);

  return c.json({ ok: true, event: updated ? serialiseEvent(updated) : null });
});

export default events;
