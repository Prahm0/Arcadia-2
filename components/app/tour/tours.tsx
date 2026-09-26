import type { ReactNode } from "react";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import {
  Avatar,
  BarChart,
  Bubble,
  CAT,
  Chip,
  Heatmap,
  Meter,
  MockButton,
  MockInput,
  Pointer,
  Row,
  Stack,
  Stat,
  TimerRing,
  Toggle,
  WeekGrid,
  Window,
} from "./TourVisuals";

function Mono({ children }: { children: ReactNode }) {
  return (
    <span className="tabular-nums text-[10px]" style={{ color: "var(--app-text)" }}>
      {children}
    </span>
  );
}

function Check({ done }: { done?: boolean }) {
  return (
    <span
      className="grid h-3.5 w-3.5 place-items-center rounded-[3px] text-[8px]"
      style={{
        background: done ? "var(--app-text)" : "var(--app-surface)",
        border: `1px solid ${done ? "var(--app-text)" : "var(--app-border-strong)"}`,
        color: "var(--app-bg)",
      }}
    >
      {done ? "✓" : ""}
    </span>
  );
}

export interface TourStep {
  title: string;
  body: string;
  visual: ReactNode;
}

export interface Tour {
  /** The page's name, as it appears in the sidebar. */
  title: string;
  steps: TourStep[];
  /** Bump to show this one tour again after its page changes, without replaying every tour. */
  version?: number;
}

export type TourId =
  | "today"
  | "arcad"
  | "profile"
  | "schedule"
  | "deadlines"
  | "focus"
  | "rooms"
  | "cards"
  | "sheets"
  | "analytics"
  | "streaks"
  | "review";

/**
 * Bump when a tour's content changes enough that people who've seen it
 * should see it again.
 */
export const TOUR_VERSION = 1;

// Every step describes what the page actually does today. If a feature
// changes, change its step in the same commit.
export const TOURS: Record<TourId, Tour> = {
  today: {
    title: "Arcadia",
    version: 2,
    steps: [
      {
        title: "Start with what is next",
        body: "Today shows the next study block Arcadia planned for you, with the subject, purpose and time it needs.",
        visual: (
          <Window width={300} title="Focus · what matters today">
            <Row bar={CAT.study} title="Kinematics review" meta="Physics · 4:00pm" right={<Mono>50m</Mono>} />
            <Row bar={CAT.study} title="Lab report draft" meta="Chemistry · 6:30pm" right={<Mono>1h</Mono>} />
            <Row bar={CAT.study} title="Essay plan" meta="English · 8:00pm" right={<Mono>30m</Mono>} />
          </Window>
        ),
      },
      {
        title: "When life happens, rebuild",
        body: "A block did not happen or a deadline moved? Tap Life happened and Arcadia makes room while protecting the important work.",
        visual: (
          <Window width={300} title="Life happened">
            <Row bar={CAT.school} title="Training moved to Thursday" meta="Make room for it" />
            <Row bar={CAT.study} title="Physics revision" meta="Shifted to Wednesday · 45 min" highlight />
            <div className="mt-2 flex justify-end"><MockButton size="sm" variant="primary">Rebuild my week</MockButton></div>
          </Window>
        ),
      },
      {
        title: "See your week clearly",
        body: "Schedule shows your commitments in grey and your subject-coloured study blocks in the gaps. Subject progress shows what is done of the plan.",
        visual: (
          <WeekGrid width={310} blocks={[
            { day: 0, start: 0, length: 4, color: CAT.school, label: "School" },
            { day: 1, start: 0, length: 4, color: CAT.school, label: "School" },
            { day: 2, start: 0, length: 4, color: CAT.school, label: "School" },
            { day: 0, start: 5, length: 2, color: CAT.study, label: "Physics" },
            { day: 2, start: 5, length: 2, color: CAT.rose, label: "Chemistry" },
          ]} />
        ),
      },
      {
        title: "Focus lights the sky",
        body: "Start a session from your next block. Study days build your streak, focus minutes light stars and stars complete the cards you collect.",
        visual: (
          <Window width={280} title="Focus">
            <div className="flex items-center justify-center py-2"><TimerRing time="45:00" label="Chemistry" progress={0.45} size={112} /></div>
            <Row bar={CAT.study} title="Chemistry revision" meta="45 min · ready to start" right={<Check />} />
          </Window>
        ),
      },
    ],
  },

  arcad: {
    title: "Arcad",
    steps: [
      {
        title: "Your month, planned",
        body: "Arcad splits your study time across the next four weeks: more before a deadline, extra for subjects you find hard, and room in the holidays. Replan whenever things change.",
        visual: (
          <Window width={290} title="Your month">
            <Row bar={CAT.study} title="This week · School holidays" meta="12h 30m" />
            <Row bar={CAT.study} title="Next week · Prac report due Thu" meta="Chemistry +1h 30m" />
            <Row bar={CAT.study} title="Week of 12 Oct · Term 4, week 2" meta="12h 30m" />
          </Window>
        ),
      },
      {
        title: "Plan by talking",
        body: "Tell Arcad what's going on in plain words: a test that moved, a busy night, a new assignment.",
        visual: (
          <Window width={290}>
            <Stack>
              <Bubble from="you">My chem test got moved to Thursday</Bubble>
              <Bubble from="arcad">Got it. I&apos;ll pull two revision blocks forward to Tue and Wed.</Bubble>
              <Bubble from="you">Can tonight be lighter? I have training</Bubble>
            </Stack>
          </Window>
        ),
      },
      {
        title: "Nothing changes until you apply",
        body: "When Arcad wants to change your plan it sends a proposal. Review it, then Apply or Decline.",
        visual: (
          <Window width={290} title="Proposal from Arcad">
            <Row bar={CAT.study} title="Move Chemistry revision" meta="Thu 6pm → Tue 6pm" />
            <Row bar={CAT.study} title="Add Chemistry practice test" meta="Wed 5 – 6pm" />
            <div className="mt-1.5 flex justify-end gap-1.5">
              <MockButton size="sm">Decline</MockButton>
              <MockButton size="sm" variant="primary">Apply</MockButton>
            </div>
            <Pointer style={{ right: 14, bottom: 4 }} />
          </Window>
        ),
      },
      {
        title: "Follow-ups on missed blocks",
        body: "If a study block ended without being ticked off, Arcad asks whether you got to it, and what got in the way if not.",
        visual: (
          <Window width={290}>
            <p className="px-1 text-[11px] font-semibold" style={{ color: "var(--app-text)" }}>Did you get to Chemistry?</p>
            <p className="mb-2 px-1 text-[10px]" style={{ color: "var(--app-text-muted)" }}>Yesterday · 6:30 – 7:30pm</p>
            <div className="flex flex-wrap gap-1.5 px-1">
              <Chip tone="accent">Ran out of time</Chip>
              <Chip>Got interrupted</Chip>
              <Chip>Wasn&apos;t ready</Chip>
              <Chip>Something else</Chip>
            </div>
          </Window>
        ),
      },
      {
        title: "It knows your context",
        body: "Arcad sees today's plan, your open tasks, subjects and streak, plus your profile: goals, subject notes and anything it has remembered.",
        visual: (
          <Window width={300} title="What Arcad knows">
            <div className="grid grid-cols-2 gap-1.5">
              <Stat label="Today" value="3" sub="blocks · 2h 10m" />
              <Stat label="Open tasks" value="5" sub="due within 2 weeks" />
              <Stat label="Subjects" value="3" sub="Physics, Chem, English" />
              <Stat label="Streak" value="4" sub="consistent days" />
            </div>
          </Window>
        ),
      },
    ],
  },

  profile: {
    title: "Profile",
    steps: [
      {
        title: "Everything Arcad plans around",
        body: "Your subjects, co-curriculars, goals and study routine live here. Change any of them and your week replans.",
        visual: (
          <Window width={280} title="Profile">
            <Stack gap={2}>
              <Row bar={CAT.school} title="Literature" meta="3h a week · 1h 30m done" />
              <Row bar={CAT.rose} title="Mathematical Methods" meta="3h a week · aiming for A" />
              <Row bar={CAT.sport} title="Basketball" meta="Every Wed · 4pm–6pm" />
            </Stack>
          </Window>
        ),
      },
      {
        title: "Tell each subject what matters",
        body: "Open a subject to set its weekly time, the grade you're aiming for, and a note Arcad reads every time it plans or talks about it.",
        visual: (
          <Window width={280} title="Literature · Note for Arcad">
            <MockInput
              multiline
              focused
              value="Weakest on unseen texts. Prefer essay practice on weekends. Our exam text is Hamlet."
            />
          </Window>
        ),
      },
      {
        title: "Make Arcad yours",
        body: "Write what Arcad should know about you and how it should talk to you. It also remembers things from your chats, and you can delete any of them.",
        visual: (
          <Window width={260}>
            <Stack gap={10}>
              <Toggle on label="Memory" />
              <Bubble from="you">I study best after dinner</Bubble>
              <Bubble from="arcad">Got it, I&apos;ll plan your sessions for the evening.</Bubble>
            </Stack>
          </Window>
        ),
      },
    ],
  },

  schedule: {
    title: "Schedule",
    version: 3,
    steps: [
      {
        title: "Your term at a glance",
        body: "Term shows every subject across the term, a square a day: outlined is planned, filled is done, a folded corner is a deadline or exam. Click a square to tick it off, move it or open the day.",
        visual: <TermSquares />,
      },
      {
        title: "Week and Day, hour by hour",
        body: "Arcadia fills the gaps around your commitments with study blocks for your open tasks. Tick a block when it's done, and use Day view to work through today.",
        visual: (
          <WeekGrid
            blocks={[
              { day: 0, start: 0, length: 4, color: CAT.school, label: "School" },
              { day: 1, start: 0, length: 4, color: CAT.school, label: "School" },
              { day: 2, start: 0, length: 4, color: CAT.school, label: "School" },
              { day: 0, start: 5, length: 2, color: CAT.study, label: "Physics" },
              { day: 1, start: 6, length: 2, color: CAT.sport, label: "Training" },
              { day: 2, start: 5, length: 1, color: CAT.study, label: "Chem" },
              { day: 3, start: 5, length: 2, color: CAT.study, label: "English" },
              { day: 5, start: 1, length: 2, color: CAT.study, label: "Chem" },
            ]}
          />
        ),
      },
      {
        title: "Open any block",
        body: "Click a block to see what it's for, start a session on it, or mark it done or missed.",
        visual: (
          <div className="relative flex items-start gap-3">
            <div
              className="mt-6 h-12 w-16 rounded-[4px] px-1.5 pt-1 text-[9px] font-semibold"
              style={{
                background: "color-mix(in oklab, var(--app-accent) 22%, var(--app-surface))",
                borderLeft: "2px solid var(--app-accent)",
                color: "var(--app-accent)",
                boxShadow: "var(--elev-2)",
              }}
            >
              Physics
            </div>
            <Window width={200}>
              <p className="px-1 text-[11px] font-semibold" style={{ color: "var(--app-text)" }}>Physics · Kinematics</p>
              <p className="mb-2 px-1 text-[9.5px]" style={{ color: "var(--app-text-muted)" }}>Mon 4:00 – 5:00pm · Part of: Prac report</p>
              <div className="flex flex-wrap gap-1.5 px-1">
                <MockButton size="sm" variant="primary">Start session</MockButton>
                <MockButton size="sm">Done</MockButton>
                <MockButton size="sm">Missed</MockButton>
              </div>
            </Window>
            <Pointer style={{ left: 40, top: 44 }} />
          </div>
        ),
      },
      {
        title: "Drag to reschedule",
        body: "Drag a study block to another time or day, or drag a deadline in the Due row to a new day. School and other commitments stay put.",
        visual: (
          <div className="relative">
            <WeekGrid
              width={300}
              blocks={[
                { day: 0, start: 0, length: 4, color: CAT.school, label: "School" },
                { day: 1, start: 0, length: 4, color: CAT.school, label: "School" },
                { day: 1, start: 5, length: 2, color: CAT.study, ghost: true },
                { day: 3, start: 3, length: 2, color: CAT.study, label: "Physics", lifted: true },
              ]}
            />
            <Pointer style={{ left: 196, top: 70 }} />
          </div>
        ),
      },
      {
        title: "Click empty space to add",
        body: "Click an empty spot on any day to add a task due then. Use the arrows or Today to move between terms, weeks and days.",
        visual: (
          <div className="relative">
            <WeekGrid
              width={300}
              blocks={[
                { day: 0, start: 0, length: 4, color: CAT.school, label: "School" },
                { day: 4, start: 5, length: 2, color: CAT.study, ghost: true, label: "+ New task" },
              ]}
            />
            <Pointer style={{ left: 236, top: 92 }} />
          </div>
        ),
      },
    ],
  },


  deadlines: {
    title: "Deadlines",
    steps: [
      {
        title: "Everything that's due",
        body: "Every open task in one list, with its subject, due date and how long it should take.",
        visual: (
          <Window width={290} title="Deadlines">
            <Row bar={CAT.rose} title="Chemistry lab report" meta="Chem · Due Fri · 90 min" right={<Chip tone="warn">3 days</Chip>} />
            <Row bar={CAT.school} title="Complex numbers set" meta="Maths · Due next Wed · 60 min" />
            <Row bar={CAT.extra} title="English essay draft" meta="English · Due 12 Oct · 120 min" />
          </Window>
        ),
      },
      {
        title: "Add a task in seconds",
        body: "New task asks for a title, subject, type, due date and a time estimate. Arcadia schedules the work before the deadline.",
        visual: (
          <Window width={290} title="New task">
            <Stack>
              <MockInput label="Title" value="Chemistry lab report" />
              <div className="grid grid-cols-2 gap-2">
                <MockInput label="Type" value="Assignment" />
                <MockInput label="Estimated time" value="1 hr 30" focused />
              </div>
              <div className="flex justify-end">
                <MockButton variant="primary">Add &amp; schedule</MockButton>
              </div>
            </Stack>
          </Window>
        ),
      },
      {
        title: "Or just tell Arcad",
        body: "Type it in Arcad chat and it adds and schedules the task for you, with no form to fill in.",
        visual: (
          <Window width={290}>
            <Stack>
              <Bubble from="you">Lab report due Friday, about 90 minutes</Bubble>
              <Bubble from="arcad">Added “Chemistry lab report” and booked Wed 6–7:30pm for it.</Bubble>
            </Stack>
          </Window>
        ),
      },
    ],
  },

  focus: {
    title: "Sessions",
    steps: [
      {
        title: "Pick a rhythm",
        body: "Choose a preset: Deep focus (50 + 10), Classic (25 + 5), Long block (90 + 15), or set your own.",
        visual: (
          <Window width={240} title="Preset">
            <Row title="Deep focus" right={<span className="tabular-nums text-[9.5px]" style={{ color: "var(--app-text-muted)" }}>50m · 10m</span>} highlight />
            <Row title="Classic" right={<span className="tabular-nums text-[9.5px]" style={{ color: "var(--app-text-muted)" }}>25m · 5m</span>} />
            <Row title="Long block" right={<span className="tabular-nums text-[9.5px]" style={{ color: "var(--app-text-muted)" }}>90m · 15m</span>} />
            <Row title="Custom" right={<span className="tabular-nums text-[9.5px]" style={{ color: "var(--app-text-muted)" }}>your call</span>} />
          </Window>
        ),
      },
      {
        title: "Say what you're working on",
        body: "Pick the subject and, if you like, a goal for the session. Your study rooms see the subject while you focus.",
        visual: (
          <Window width={250} title="Working on">
            <Stack>
              <MockInput label="Subject" value="Physics" />
              <MockInput label="Goal (optional)" value="Finish Q1–6 of the momentum set" focused />
            </Stack>
          </Window>
        ),
      },
      {
        title: "Start, and let it run",
        body: "When focus ends the break starts on its own, and the session is logged to your stats. Skip or Reset any time.",
        visual: (
          <div className="flex items-center gap-4">
            <TimerRing time="32:14" label="Focus" progress={0.36} />
            <Stack gap={6}>
              <MockButton variant="primary">Pause</MockButton>
              <MockButton>Skip</MockButton>
            </Stack>
          </div>
        ),
      },
      {
        title: "Count distractions",
        body: "Caught yourself drifting? Tap Distraction while the timer runs. The count is saved with the session.",
        visual: (
          <div className="flex flex-col items-center gap-3">
            <TimerRing time="18:40" label="Focus" progress={0.62} size={100} />
            <span
              className="rounded-md px-3 py-1 text-[10.5px] font-medium"
              style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-text-muted)", background: "var(--app-surface)" }}
            >
              Distraction · <span className="tabular-nums">2</span>
            </span>
          </div>
        ),
      },
      {
        title: "Pop it out",
        body: "Pop out floats a small timer over your other windows. Drag it anywhere, then click the clock to open this session's to-do list.",
        visual: (
          <Window width={230} title="Session · Chemistry">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-[22px] font-medium tabular-nums" style={{ color: "var(--app-text)" }}>24:13</span>
              <Mono>1/3</Mono>
            </div>
            <Row title="Reread the notes" right={<Check done />} />
            <Row title="Questions 4–9" right={<Check />} highlight />
            <Row title="Write up the method" right={<Check />} />
          </Window>
        ),
      },
    ],
  },

  rooms: {
    title: "Rooms",
    steps: [
      {
        title: "Create or join a room",
        body: "Create a room and share its 6-letter code or link. Friends type the code under Join, or just open the link.",
        visual: (
          <div className="grid w-[300px] grid-cols-2 gap-2">
            <Window width={146} title="Create a room">
              <Stack>
                <MockInput value="Year 12 grind" />
                <MockButton size="sm" variant="primary">Create</MockButton>
              </Stack>
            </Window>
            <Window width={146} title="Join with a code">
              <Stack>
                <MockInput value="UX8SEK" focused />
                <MockButton size="sm">Join</MockButton>
              </Stack>
            </Window>
          </div>
        ),
      },
      {
        title: "See who's studying",
        body: "Everyone's card shows whether they're focusing, what on and for how long. Whoever's studying comes first.",
        visual: (
          <div className="grid w-[310px] grid-cols-2 gap-2">
            <Window width={152}>
              <div className="flex items-center gap-2">
                <Avatar name="Josh" active />
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold" style={{ color: "var(--app-text)" }}>Josh</p>
                  <p className="text-[9px]" style={{ color: "var(--app-text-muted)" }}>Chemistry</p>
                </div>
                <Chip tone="success">Focusing</Chip>
              </div>
              <p className="mt-2 tabular-nums text-[15px]" style={{ color: "var(--app-text)" }}>24:08</p>
            </Window>
            <Window width={152}>
              <div className="flex items-center gap-2">
                <Avatar name="Priya" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold" style={{ color: "var(--app-text)" }}>Priya</p>
                  <p className="text-[9px]" style={{ color: "var(--app-text-muted)" }}>Idle</p>
                </div>
              </div>
              <p className="mt-2 text-[10px]" style={{ color: "var(--app-text-muted)" }}>Studied 52m today</p>
            </Window>
          </div>
        ),
      },
      {
        title: "Start here, or join in",
        body: "Start a session from the room, or join someone's and finish together. A timer on the Sessions page shows here too.",
        visual: (
          <div className="flex items-center gap-3">
            <TimerRing time="32:14" label="Focus" progress={0.3} size={96} />
            <Window width={170}>
              <p className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>Josh is 13 min in</p>
              <div className="mt-2 flex gap-1.5">
                <MockButton size="sm">Join</MockButton>
                <MockButton size="sm">👏 Cheer</MockButton>
              </div>
            </Window>
          </div>
        ),
      },
      {
        title: "Cheer, climb, reach the goal",
        body: "Cheer people on mid-session. The leaderboard ranks the room by day, week, term and all time, and a shared goal fills as everyone studies.",
        visual: (
          <Window width={270} title="Leaderboard · past 7 days">
            <Row title="1  Josh" right={<span className="tabular-nums text-[11px]" style={{ color: "var(--app-text)" }}>6h 42m</span>} />
            <Row title="2  You" right={<span className="tabular-nums text-[11px]" style={{ color: "var(--app-text)" }}>5h 18m</span>} />
            <Row title="3  Priya" right={<span className="tabular-nums text-[11px]" style={{ color: "var(--app-text)" }}>4h 51m</span>} />
          </Window>
        ),
      },
    ],
  },

  sheets: {
    title: "Sheets",
    steps: [
      {
        title: "One page per topic",
        body: "Key ideas, formulas, definitions and common mistakes for a topic. Prints on one A4 page.",
        visual: (
          <Window width={280} title="Stoichiometry">
            <Stack gap={6}>
              <Row bar={CAT.study} title="Formulas" meta="n = m / M · c = n / V" />
              <Row bar={CAT.study} title="Definitions" meta="Mole · Limiting reagent" />
              <Row bar={CAT.study} title="Common mistakes" meta="Balance the equation first" />
            </Stack>
          </Window>
        ),
      },
      {
        title: "Generated drafts",
        body: "Generate a first draft from an uploaded file or a deck. Only that source is used, and nothing is saved until you save it.",
        visual: (
          <Window width={270} title="New sheet">
            <Stack gap={6}>
              <MockInput label="Draft from" value="File · Chemistry notes ch3.pdf" />
              <div className="flex justify-end">
                <MockButton variant="primary">Generate draft</MockButton>
              </div>
            </Stack>
          </Window>
        ),
      },
      {
        title: "Sheets to flashcards",
        body: "Write one \"term: meaning\" per line under Definitions or Formulas, and Make flashcards turns them into a deck.",
        visual: (
          <Window width={260}>
            <p className="text-[10.5px]" style={{ color: "var(--app-text)" }}>- Mole: 6.022 × 10²³ particles</p>
            <div className="mt-2 flex justify-end">
              <Chip tone="accent">12 cards made</Chip>
            </div>
          </Window>
        ),
      },
    ],
  },

  cards: {
    title: "Cards",
    steps: [
      {
        title: "Make a deck in seconds",
        body: "Type cards in, or paste a list: one card per line, term and definition split by a tab. Quizlet's export pastes straight in.",
        visual: (
          <Window width={300} title="New deck">
            <Stack>
              <MockInput label="Name" value="Stoichiometry" />
              <MockInput label="Paste a list" value="Mole ⇥ 6.022 × 10²³ particles" focused />
              <div className="flex justify-end">
                <MockButton variant="primary">Make deck (2)</MockButton>
              </div>
            </Stack>
          </Window>
        ),
      },
      {
        title: "Flashcards and Learn",
        body: "Flashcards: flip, then Got it or Not yet. Learn: multiple choice until you know a card, then you type it. Wrong cards come round again.",
        visual: (
          <Window width={290}>
            <Stack>
              <div className="rounded-md px-3 py-4 text-center" style={{ background: "var(--app-surface-soft)" }}>
                <Mono>The reactant that runs out first</Mono>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <MockButton size="sm">1 Mole</MockButton>
                <MockButton size="sm" variant="primary">2 Limiting reagent</MockButton>
                <MockButton size="sm">3 Excess</MockButton>
                <MockButton size="sm">4 Yield</MockButton>
              </div>
            </Stack>
          </Window>
        ),
      },
      {
        title: "Cards come back when they're due",
        body: "Each right answer spaces a card out: tomorrow, 3 days, a week, then longer. Miss one and it's due again. Review all due does every deck at once.",
        visual: (
          <Window width={290} title="Cards">
            <Row bar={CAT.study} title="18 cards due today" meta="Chemistry 12 · Biology 6" right={<MockButton size="sm" variant="primary">Review all</MockButton>} />
            <Row bar={CAT.school} title="Stoichiometry" meta="42 cards · 12 due" />
            <Row bar={CAT.sport} title="Cell organelles" meta="28 cards · all mastered" right={<Chip tone="success">Mastered</Chip>} />
          </Window>
        ),
      },
    ],
  },

  analytics: {
    title: "Analytics",
    steps: [
      {
        title: "Your study, measured",
        body: "Focus time, sessions, average session length and active days for the last 7 or 30 days, each against the period before. Switch with Week and Month at the top.",
        visual: (
          <div className="grid w-[300px] grid-cols-3 gap-2">
            <Stat label="Focus time" value="6h 10m" />
            <Stat label="Sessions" value="9" />
            <Stat label="Avg session" value="41" sub="min" />
          </div>
        ),
      },
      {
        title: "Where the time went",
        body: "Daily focus shows each day next to the same day last period. Hover a bar for the exact numbers. By subject shows how your time splits.",
        visual: (
          <div className="grid w-[310px] grid-cols-[1.3fr_1fr] gap-2">
            <Window width={170}>
              <BarChart values={[40, 75, 0, 90, 55, 120, 30]} labels={["M", "T", "W", "T", "F", "S", "S"]} height={56} highlight={5} />
            </Window>
            <Window width={130}>
              <Stack gap={7}>
                <Meter label="Physics" value="2h 30m" fraction={0.8} />
                <Meter label="Chem" value="1h 50m" fraction={0.6} />
                <Meter label="English" value="50m" fraction={0.28} />
              </Stack>
            </Window>
          </div>
        ),
      },
      {
        title: "When you study",
        body: "Time of day adds up your focus minutes by hour, so you can see when you actually get work done.",
        visual: (
          <Window width={220}>
            <BarChart values={[0, 10, 45, 60, 20, 0, 30, 90]} labels={["9", "", "12", "", "3", "", "6", ""]} height={48} highlight={7} />
          </Window>
        ),
      },
      {
        title: "Consistency over months",
        body: "The heatmap shades each of the last 90 days by minutes focused. Gaps show up at a glance.",
        visual: (
          <Window width={200} style={{ width: "auto" }}>
            <Heatmap weeks={14} />
          </Window>
        ),
      },
    ],
  },

  streaks: {
    title: "Streaks",
    steps: [
      {
        title: "How streaks count",
        body: "A day counts toward your streak when you complete at least 70% of the study minutes you planned for it.",
        visual: (
          <Window width={270}>
            <Meter label="Today · planned 2h" value="1h 30m · 75%" fraction={0.75} />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>70% locks the day in</span>
              <Chip tone="success">Counts ✓</Chip>
            </div>
          </Window>
        ),
      },
      {
        title: "A chain of days",
        body: "Each day that counts lights a star and joins the chain. A day under 70% breaks it. Days with nothing planned don't count either way. Tap a day to see how it went.",
        visual: (
          <Window width={260}>
            <div className="flex items-center justify-between px-1 py-2">
              {[1, 1, 0.5, 1, 1, 1, 0].map((lit, index) => (
                <span key={index} className="text-[14px]" style={{ color: "var(--app-text)", opacity: lit === 1 ? 1 : lit ? 0.3 : 0.15 }}>
                  {lit === 0.5 ? "·" : "✦"}
                </span>
              ))}
            </div>
            <p className="text-[9.5px]" style={{ color: "var(--app-text-muted)" }}>5-day streak · a rest day on Wednesday · today still open</p>
          </Window>
        ),
      },
      {
        title: "Streak cards keep the rest",
        body: "Every minute of focus lights stars on your streak cards. A finished one that's yours for good. A streak can break; stars stay lit.",
        visual: (
          <Window width={260}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium" style={{ color: "var(--app-text)" }}>The Sentinel</span>
              <span className="text-[9.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>5 of 7 stars lit</span>
            </div>
            <Meter label="Next: 6 study days" value="5 / 6" fraction={5 / 7} />
          </Window>
        ),
      },
    ],
  },

  review: {
    title: "Weekly review",
    steps: [
      {
        title: "Planned vs done",
        body: "See how much of the week's planned study you did, in time and in sessions. Switch between this week and last week.",
        visual: (
          <Window width={280} title="Last week">
            <Meter label="6h 10m of 8h" value="77%" fraction={0.77} />
            <p className="mt-1.5 text-[9.5px]" style={{ color: "var(--app-text-muted)" }}>77% of planned time · 9 of 11 sessions</p>
          </Window>
        ),
      },
      {
        title: "Subject by subject",
        body: "Each subject shows done against planned, so you can see which one is quietly falling behind.",
        visual: (
          <Window width={260}>
            <Stack gap={8}>
              <Meter label="Physics" value="2h 30m / 2h 30m" fraction={1} />
              <Meter label="Chemistry" value="1h 50m / 3h" fraction={0.61} />
              <Meter label="English" value="50m / 1h 30m" fraction={0.55} />
            </Stack>
          </Window>
        ),
      },
      {
        title: "One win, one adjustment",
        body: "Arcadia picks out the week's best moment and one specific thing to change next week.",
        visual: (
          <Window width={280}>
            <Stack gap={8}>
              <div>
                <Chip tone="success">Win</Chip>
                <p className="mt-1 text-[10.5px]" style={{ color: "var(--app-text)" }}>Every Physics block done, all four.</p>
              </div>
              <div>
                <Chip tone="accent">Adjustment</Chip>
                <p className="mt-1 text-[10.5px]" style={{ color: "var(--app-text)" }}>Friday nights keep slipping, so move them to Saturday morning.</p>
              </div>
            </Stack>
          </Window>
        ),
      },
      {
        title: "Consistency and streak",
        body: "See how many planned days crossed the 70% line, plus your current and longest streak.",
        visual: (
          <Window width={250}>
            <p className="text-[10.5px]" style={{ color: "var(--app-text)" }}>4 of 5 planned days hit 70%</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>Streak</span>
              <Chip tone="accent">4 consistent days · longest 9</Chip>
            </div>
          </Window>
        ),
      },
    ],
  },
};

// Which tour the page on screen offers, so the Help menu can reach it
// without knowing about routes. PageTour sets it while mounted.
let activeTour: TourId | null = null;
const listeners = new Set<() => void>();

export function setActiveTour(id: TourId | null): void {
  activeTour = id;
  listeners.forEach((listener) => listener());
}

export function subscribeActiveTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveTour(): TourId | null {
  return activeTour;
}

/** A few rows of the term view: planned, part done, done, and a deadline corner. */
function TermSquares() {
  const rows: Array<{ name: string; hue: string; cells: Array<"" | "plan" | "part" | "done" | "due" | "exam"> }> = [
    { name: "Maths", hue: SUBJECT_COLORS[0], cells: ["done", "done", "", "done", "part", "plan", "plan", "", "plan", "due"] },
    { name: "Physics", hue: SUBJECT_COLORS[1], cells: ["done", "", "done", "part", "", "plan", "", "exam", "", ""] },
    { name: "English", hue: SUBJECT_COLORS[2], cells: ["", "done", "done", "", "done", "", "plan", "plan", "", "plan"] },
  ];
  return (
    <Window width={280}>
      <Stack gap={6} style={{ padding: "4px 6px" }}>
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-2">
            <span className="w-12 text-[10px] font-medium" style={{ color: `color-mix(in oklab, ${row.hue} 70%, var(--app-text))` }}>{row.name}</span>
            <span className="flex gap-[3px]">
              {row.cells.map((cell, i) => (
                <span
                  key={i}
                  className="relative h-[13px] w-[13px] overflow-hidden rounded-[3px]"
                  style={{
                    background: cell === "done" ? row.hue : cell === "part" ? `linear-gradient(to top, ${row.hue} 50%, transparent 50%)` : cell === "plan" ? "transparent" : "var(--app-surface-soft)",
                    boxShadow: cell === "plan" || cell === "part" ? `inset 0 0 0 1.25px ${row.hue}` : undefined,
                  }}
                >
                  {cell === "due" || cell === "exam" ? (
                    <span className="absolute right-0 top-0 h-0 w-0" style={{ borderTop: `6px solid ${cell === "exam" ? "var(--app-danger)" : "var(--app-text)"}`, borderLeft: "6px solid transparent" }} />
                  ) : null}
                </span>
              ))}
            </span>
          </div>
        ))}
      </Stack>
    </Window>
  );
}
