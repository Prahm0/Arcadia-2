import Link from "next/link";
import PageHeader from "./PageHeader";

const TOOLS = [
  { href: "/app/sessions", title: "Focus timer", body: "Start a timed session, study with others in a room." },
  { href: "/app/cards", title: "Flashcards", body: "Quiz yourself. Arcad can make the cards from your notes." },
  { href: "/app/sheets", title: "Summary sheets", body: "One page per topic with the formulas, terms and mistakes to know." },
  { href: "/app/files", title: "Files", body: "Your notes, slides and PDFs, kept with your subjects." },
];

/** The study helpers in one place, each with a plain name and one line on what it's for. */
export default function StudyToolsView() {
  return (
    <>
      <PageHeader width={720} title="Study tools" />
      <div className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-4 sm:px-10">
        <ul className="overflow-hidden rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
          {TOOLS.map((tool, index) => (
            <li key={tool.href} style={index ? { borderTop: "1px solid var(--app-border)" } : undefined}>
              <Link href={tool.href} className="ui-hover flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[15.5px] font-semibold" style={{ color: "var(--app-text)" }}>{tool.title}</p>
                  <p className="mt-0.5 text-[13px] leading-5" style={{ color: "var(--app-text-muted)" }}>{tool.body}</p>
                </div>
                <span aria-hidden="true" className="text-lg" style={{ color: "var(--app-text-faint)" }}>›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
