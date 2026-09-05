# Arcadia — landing page

Marketing site for Arcadia, an AI study planner that builds a schedule around a
student's real life and reorganises it when things change.

Built with Next.js (App Router), React, TypeScript, Tailwind CSS v4 and Framer
Motion. The star field and constellation are hand-rolled Canvas/SVG; no other
runtime dependencies.

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
  layout.tsx          fonts, metadata, viewport
  page.tsx            section order
  globals.css         design tokens, type scale, hero entrance keyframes
  api/waitlist/       waitlist route handler (the only server code)
  privacy/, terms/    early-access legal pages
components/
  Hero, HeroInterface, Starfield, Constellation
  ProblemSection, ThinkingSection (+ ThinkingVisual), TodayDemo
  ScheduleDemo, ScheduleEvent, ArcadiaInput, ConnectionsSection
  MentorSection, BrandStatement, FinalCTA, Footer, Navbar
  EarlyAccessProvider, EarlyAccessDialog, WaitlistForm
  ui/  Button, SectionLabel, RevealText, FadeIn, Container, LazyMount
lib/
  animation.ts        shared easing and durations
  schedule.ts         schedule model, sample week, the "training moved" change set
  demo-data.ts        Today, Tell Arcadia and AI Mentor content
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
