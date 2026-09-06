# Arcadia — landing page

Marketing site for Arcadia, an AI study planner that builds a schedule around a
student's real life and reorganises it when things change.

Built with Next.js (App Router), React, TypeScript, Tailwind CSS v4, Framer
Motion and Three.js (the star field). Type is Inter, with JetBrains Mono for
anything that is a time or a label and Instrument Serif italic for one
emphasised word per headline.

The page follows one sample week (7–11 September) from top to bottom and the
background moves through the hours of the day: night → dawn → noon → evening →
dusk → night. Section surfaces are the `night-*`, `dusk`,
`dawn`, `noon` and `afternoon` tokens in `app/globals.css`.

## Run it

```bash
npm install --ignore-scripts
npm run dev        # http://localhost:3000
npm run build && npm run start
npm run lint
```

`--ignore-scripts` sidesteps a postinstall script in an ESLint resolver
dependency that fails on some Windows setups; nothing in the app needs it.

## Structure

```
app/
  layout.tsx          fonts (Inter, JetBrains Mono, Instrument Serif), metadata
  page.tsx            section order (one week, night to night)
  globals.css         hour tokens, type scale, grain, marquee and hero keyframes
  api/waitlist/       waitlist route handler (the only server code)
  privacy/, terms/    early-access legal pages
components/
  Hero, HeroInterface, LiveNow, Starfield, Constellation
  ProblemSection (+ RealLifeMarquee), ThinkingSection (+ ThinkingVisual), TodayDemo
  ArcadiaInput, ScheduleDemo, ScheduleEvent, ConnectionsSection
  MentorSection, FinalCTA, Footer, Navbar
  EarlyAccessProvider, EarlyAccessDialog, WaitlistForm
  ui/  Button, SectionLabel, RevealText, FadeIn, Container, LazyMount
lib/
  animation.ts        shared easing and durations
  schedule.ts         schedule model, sample week, the "training moved" change set
  demo-data.ts        Today, Tell Arcadia and AI Mentor content
  real-life.ts        the interruptions in the Real life marquee
  stars.ts            deterministic star generation
  constellation.ts, connections.ts, thinking.ts   scroll-sequence geometry
  hooks.ts            media queries, reduced motion, scroll progress
  waitlist.ts         client-side submission + validation
```

## Waitlist

`POST /api/waitlist` validates the address and then either forwards it to
`WAITLIST_WEBHOOK_URL` (if set) or appends it to `.data/waitlist.jsonl` on the
server. Swap the `deliver()` function in `app/api/waitlist/route.ts` to connect
a real provider.

## Notes

- Scroll-linked sections copy Framer's scroll progress into a plain motion
  value (`useScrollProgress`). Framer 13 otherwise hands scroll-linked opacity
  to a native ViewTimeline animation that ends on the wrong keyframe.
- Reduced motion: structural choices use `usePrefersReducedMotion` (false on
  the server and first client render, so markup hydrates cleanly);
  `MotionConfig reducedMotion="user"` removes transform animation globally.
- `next dev` regenerates `AGENTS.md` / `CLAUDE.md`; they are not part of the site.
