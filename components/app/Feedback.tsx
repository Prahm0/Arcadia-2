"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api/client";
import AppButton from "./AppButton";

type FeedbackType = "bug" | "idea" | "other";
type FeedbackSort = "newest" | "oldest" | "type";
interface FeedbackItem {
  id: string;
  type: FeedbackType;
  message: string;
  email: string | null;
  createdAt: string;
}
interface FeedbackPage {
  items: FeedbackItem[];
  hasMore: boolean;
}

const fieldStyle = {
  background: "var(--app-surface-soft)",
  boxShadow: "var(--elev-inset)",
  color: "var(--app-text)",
};

export function FeedbackForm({ email }: { email: string | null }) {
  const [type, setType] = useState<FeedbackType>("other");
  const [message, setMessage] = useState("");
  const [contactMe, setContactMe] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setNotice(null);
    try {
      await api("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ type, message: message.trim(), contactMe: Boolean(email && contactMe) }),
      });
      setMessage("");
      setType("other");
      setContactMe(false);
      setNotice({ error: false, text: "Thanks for your feedback. The Arcadia team can now see it." });
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Couldn't send feedback. Please try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[13.5px] leading-5" style={{ color: "var(--app-text)" }}>
        We&apos;re always working to make Arcadia better.
      </p>
      <p className="text-[13.5px] leading-5" style={{ color: "var(--app-text-muted)" }}>
        Share an idea, report a problem, or tell us what&apos;s working.
      </p>
      <label className="flex flex-col gap-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
        Type
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value as FeedbackType);
            setNotice(null);
          }}
          className="w-full max-w-xs rounded-md px-3 py-2.5 text-[14px] outline-none"
          style={fieldStyle}
        >
          <option value="bug">Bug</option>
          <option value="idea">Idea</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="flex flex-col gap-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
        What would you like us to know?
        <textarea
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            setNotice(null);
          }}
          maxLength={3000}
          required
          rows={5}
          placeholder="Tell us a little about it…"
          className="w-full resize-y rounded-md px-3 py-2.5 text-[14px] leading-6 outline-none"
          style={fieldStyle}
        />
      </label>
      <div>
        <label className="flex items-center gap-2 text-[13.5px]" style={{ color: "var(--app-text)" }}>
          <input
            type="checkbox"
            checked={contactMe}
            onChange={(event) => {
              setContactMe(event.target.checked);
              setNotice(null);
            }}
            disabled={!email}
            className="h-4 w-4"
            style={{ accentColor: "var(--app-accent)" }}
          />
          You can contact me about this
        </label>
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {!email
            ? "Guest accounts have no contact email, so no email will be included."
            : contactMe
              ? `Your account email (${email}) will be included with this submission.`
              : "Your email won't be included with this submission."}
        </p>
      </div>
      <p className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
        Your feedback is visible to the Arcadia team.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {notice ? (
          <p role={notice.error ? "alert" : "status"} className="text-[13px]" style={{ color: notice.error ? "var(--app-danger)" : "var(--app-success)" }}>
            {notice.text}
          </p>
        ) : <span />}
        <AppButton type="submit" variant="primary" loading={sending} disabled={!message.trim()}>
          Send feedback
        </AppButton>
      </div>
    </form>
  );
}

export function DeveloperFeedback() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType | "all">("all");
  const [sort, setSort] = useState<FeedbackSort>("newest");
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    setItems([]);
    setHasMore(false);
    api<FeedbackPage>(`/api/feedback/developer?type=${type}&sort=${sort}&offset=0`)
      .then((page) => {
        if (requestId.current !== id) return;
        setItems(page.items);
        setHasMore(page.hasMore);
      })
      .catch((reason) => {
        if (requestId.current === id) setError(reason instanceof Error ? reason.message : "Couldn't load feedback.");
      })
      .finally(() => { if (requestId.current === id) setLoading(false); });
    return () => { requestId.current++; };
  }, [open, type, sort, refresh]);

  async function loadMore() {
    if (loading || !hasMore) return;
    const id = requestId.current;
    setLoading(true);
    setError("");
    try {
      const page = await api<FeedbackPage>(`/api/feedback/developer?type=${type}&sort=${sort}&offset=${items.length}`);
      if (requestId.current !== id) return;
      setItems((current) => [...current, ...page.items]);
      setHasMore(page.hasMore);
    } catch (reason) {
      if (requestId.current === id) setError(reason instanceof Error ? reason.message : "Couldn't load more feedback.");
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
          Read submissions from Arcadia users.
        </p>
        <AppButton type="button" variant="secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? "Hide feedback" : "View feedback"}
        </AppButton>
      </div>
      {open ? (
        <div className="flex flex-col gap-4 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
              Filter by type
              <select value={type} onChange={(event) => setType(event.target.value as FeedbackType | "all")} className="rounded-md px-3 py-2 text-[13px]" style={fieldStyle}>
                <option value="all">All types</option>
                <option value="bug">Bugs</option>
                <option value="idea">Ideas</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
              Sort
              <select value={sort} onChange={(event) => setSort(event.target.value as FeedbackSort)} className="rounded-md px-3 py-2 text-[13px]" style={fieldStyle}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="type">By type</option>
              </select>
            </label>
            <AppButton type="button" variant="ghost" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>Refresh</AppButton>
          </div>
          {error ? <p role="alert" className="text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
          {!loading && !error && items.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>No feedback in this view yet.</p>
          ) : null}
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-md border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-soft)" }}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                  <span className="font-semibold uppercase tracking-wide" style={{ color: "var(--app-text)" }}>{item.type}</span>
                  <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-[13.5px] leading-5" style={{ color: "var(--app-text)" }}>{item.message}</p>
                {item.email ? <p className="mt-2 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Contact: {item.email}</p> : null}
              </article>
            ))}
          </div>
          {hasMore ? <AppButton type="button" variant="secondary" loading={loading} onClick={() => void loadMore()}>Load more</AppButton> : null}
          {loading && items.length === 0 ? <p role="status" className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>Loading feedback…</p> : null}
        </div>
      ) : null}
    </div>
  );
}
