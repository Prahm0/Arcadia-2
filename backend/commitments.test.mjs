// node --test commitments.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The Worker bundler resolves extensionless local TypeScript imports. Node's
// type-stripping runner needs the extension added explicitly.
registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.startsWith(".") || specifier.endsWith(".ts")) return next(specifier, context);
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return next(candidate, context);
      } catch {
        // Try the next valid Worker import shape.
      }
    }
    return next(specifier, context);
  },
});

const { commitmentProblem } = await import("./src/routes/commitments.ts");

const valid = {
  title: "Basketball training",
  category: "sport",
  recurrence: "weekly",
  weekday: 2,
  startTime: "16:00",
  endTime: "18:00",
};

test("commitment buffers accept the supported 0 to 240 minute range", () => {
  assert.equal(commitmentProblem({ ...valid, bufferBefore: 0, bufferAfter: 240 }), null);
  assert.equal(commitmentProblem({ ...valid, bufferBefore: 15, bufferAfter: 120 }), null);
});

test("commitment buffers reject invalid values", () => {
  assert.match(commitmentProblem({ ...valid, bufferBefore: -1 }) ?? "", /0 minutes and 4 hours/);
  assert.match(commitmentProblem({ ...valid, bufferAfter: 241 }) ?? "", /0 minutes and 4 hours/);
  assert.match(commitmentProblem({ ...valid, bufferBefore: 30.5 }) ?? "", /0 minutes and 4 hours/);
});

test("commitment days off must be local ISO dates", () => {
  assert.equal(commitmentProblem({ ...valid, skipDates: ["2026-10-13", "2026-10-20"] }), null);
  assert.equal(commitmentProblem({ ...valid, skipDates: ["next Tuesday"] }), "Use valid dates for days off.");
  assert.equal(commitmentProblem({ ...valid, skipDates: ["2026-02-31"] }), "Use valid dates for days off.");
  assert.equal(commitmentProblem({ ...valid, skipDates: "2026-10-13" }), "Use valid dates for days off.");
});
