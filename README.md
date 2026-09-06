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
  api/[...path]/      proxy to the Cloudflare API, including the waitlist
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

`POST /api/waitlist` passes through the shared API proxy to the Cloudflare
backend, which validates the address and stores it in D1. New addresses receive
a confirmation email when Resend is configured. Repeat submissions do not add
a second row.

Run the backend locally using [backend/README.md](backend/README.md). The proxy
defaults to `http://127.0.0.1:8787`; set `ARCADIA_BACKEND_ORIGIN` in `.env.local`
if the backend runs elsewhere. Production uses the value in `wrangler.jsonc`.
See [backend/DEPLOY.md](backend/DEPLOY.md) for deployment and waitlist checks.

The old `WAITLIST_WEBHOOK_URL` and local `.data/waitlist.jsonl` handler are no
longer used. Existing local waitlist records are left in place and are not
migrated automatically.

## Notes

- Scroll-linked sections copy Framer's scroll progress into a plain motion
  value (`useScrollProgress`). Framer 13 otherwise hands scroll-linked opacity
  to a native ViewTimeline animation that ends on the wrong keyframe.
- Reduced motion: structural choices use `usePrefersReducedMotion` (false on
  the server and first client render, so markup hydrates cleanly);
  `MotionConfig reducedMotion="user"` removes transform animation globally.
- `next dev` regenerates `AGENTS.md` / `CLAUDE.md`; they are not part of the site.
