import test from "node:test";
import assert from "node:assert/strict";
import { focusReportLine } from "./src/lib/focus-report.ts";

test("no reports means nothing for Arcad", () => {
  assert.equal(focusReportLine([{ blockedAttempts: null, unlockSnoozes: null }]), null);
});

test("a week of blocked study reads as one line", () => {
  const rows = [
    { blockedAttempts: 3, unlockSnoozes: 1 },
    { blockedAttempts: 0, unlockSnoozes: 0 },
    { blockedAttempts: 6, unlockSnoozes: 1 },
    { blockedAttempts: null, unlockSnoozes: null },
  ];
  assert.equal(focusReportLine(rows), "Over 3 blocked study blocks this week they tried to open a blocked app 9 times (in 2 of the blocks) and took 5 more minutes twice.");
});

test("a clean block says so", () => {
  assert.equal(focusReportLine([{ blockedAttempts: 0, unlockSnoozes: 0 }]), "Over 1 blocked study block this week they never tried to open a blocked app.");
});
