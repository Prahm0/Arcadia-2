export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Facts Arcad saved to memory on this reply. Only on replies from this visit. */
  remembered?: string[];
  /** A message of yours that never reached Arcad. */
  failed?: boolean;
}

export interface Proposal {
  id: string;
  summary: string;
  status: "pending" | "applied" | "declined" | "expired" | string;
  operations: unknown[];
  createdAt: string;
  expiresAt: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
  createdAt: string;
}

/** Why the last send failed, and what the student can do about it. */
export interface SendError {
  message: string;
  /** Out of messages for today: show the upgrade, not a retry. */
  capped?: boolean;
  upgradeTier?: "pro" | "max" | null;
}

export interface ArcadUsage {
  tier: "free" | "pro" | "max";
  used: number;
  cap: number;
  upgradeTier: "pro" | "max" | null;
  resetAt: string;
}
