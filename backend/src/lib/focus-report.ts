/** One study block's app-blocking report from the phone. */
export interface FocusReportRow {
  blockedAttempts: number | null;
  unlockSnoozes: number | null;
}

/**
 * A line for Arcad about the last week's blocked study, or null when the
 * phone hasn't reported any: "Over 6 blocked study blocks this week they
 * tried to open a blocked app 9 times (in 4 of the blocks) and took 5 more
 * minutes twice."
 */
export function focusReportLine(rows: FocusReportRow[]): string | null {
  const reported = rows.filter((row) => row.blockedAttempts !== null);
  if (!reported.length) return null;
  const attempts = reported.reduce((sum, row) => sum + (row.blockedAttempts ?? 0), 0);
  const reached = reported.filter((row) => (row.blockedAttempts ?? 0) > 0).length;
  const snoozes = reported.reduce((sum, row) => sum + (row.unlockSnoozes ?? 0), 0);
  const blocks = `${reported.length} blocked study ${reported.length === 1 ? "block" : "blocks"}`;
  const tried = attempts === 0
    ? "they never tried to open a blocked app"
    : `they tried to open a blocked app ${times(attempts)} (in ${reached} of the blocks)`;
  const extra = snoozes === 0 ? "" : ` and took 5 more minutes ${times(snoozes)}`;
  return `Over ${blocks} this week ${tried}${extra}.`;
}

function times(count: number): string {
  if (count === 1) return "once";
  if (count === 2) return "twice";
  return `${count} times`;
}
