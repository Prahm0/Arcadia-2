import { h, type ScheduleBlock } from "./schedule";

/* ------------------------------------------------------------------ */
/* Today                                                               */
/* ------------------------------------------------------------------ */

export interface FocusItem {
  id: string;
  subject: string;
  task: string;
  minutes: number;
  due: string;
  progress: number; // 0–1 of this task already done
}

export const today = {
  date: "Tuesday, September 8",
  greeting: "Good morning.",
  summary: "3 things to focus on today.",
  weekProgress: 0.42,
  focus: [
    { id: "methods", subject: "Mathematical Methods", task: "Complex Numbers Practice", minutes: 45, due: "Test Fri", progress: 0.3 },
    { id: "english", subject: "English", task: "Essay Draft", minutes: 70, due: "Due Thu", progress: 0 },
    { id: "chem", subject: "Chemistry", task: "Equilibrium Review", minutes: 35, due: "Due Mon", progress: 0.6 },
  ] satisfies FocusItem[],
  later: [
    { time: "5:00 pm", title: "Methods Practice" },
    { time: "6:30 pm", title: "Dinner at Nan’s" },
    { time: "10:30 pm", title: "Sleep" },
  ],
};

/* ------------------------------------------------------------------ */
/* Tell Arcadia                                                        */
/* ------------------------------------------------------------------ */

export const tellArcadia = {
  student:
    "I have training after school tomorrow and probably won’t be home until 7.",
  arcadia:
    "Done. I moved Chemistry to Thursday, shortened tonight’s English session and kept your Methods revision before Friday’s test.",
};

export type TellDay = "Tue" | "Wed" | "Thu";

export const tellDays: { key: TellDay; label: string; sub: string }[] = [
  { key: "Tue", label: "Tonight", sub: "Tue 8" },
  { key: "Wed", label: "Tomorrow", sub: "Wed 9" },
  { key: "Thu", label: "Thursday", sub: "Thu 10" },
];

export const tellBefore: ScheduleBlock[] = [
  { id: "t-tue-chem", day: "Tue", start: h(16), end: h(16, 35), title: "Chemistry Review", category: "study" },
  { id: "t-tue-methods", day: "Tue", start: h(17), end: h(17, 45), title: "Methods Practice", category: "study" },
  { id: "t-tue-english", day: "Tue", start: h(19, 30), end: h(20, 30), title: "English Essay", category: "study" },
  { id: "t-wed-chem", day: "Wed", start: h(16, 30), end: h(17, 10), title: "Chemistry Homework", category: "study" },
  { id: "t-wed-english", day: "Wed", start: h(17, 30), end: h(18, 30), title: "English Essay", category: "study" },
  { id: "t-thu-methods", day: "Thu", start: h(17), end: h(17, 40), title: "Methods Revision", category: "study" },
];

export const tellAfter: ScheduleBlock[] = [
  { id: "t-tue-chem", day: "Tue", start: h(16), end: h(16, 35), title: "Chemistry Review", category: "study" },
  { id: "t-tue-methods", day: "Tue", start: h(17), end: h(17, 45), title: "Methods Practice", category: "study" },
  { id: "t-tue-english", day: "Tue", start: h(19, 30), end: h(20, 10), title: "English Essay", category: "study", change: "shortened" },
  { id: "t-wed-training", day: "Wed", start: h(15, 30), end: h(19), title: "Training", category: "sport", change: "new" },
  { id: "t-wed-english", day: "Wed", start: h(19, 30), end: h(20, 30), title: "English Essay", category: "study", change: "shifted" },
  { id: "t-wed-chem", day: "Thu", start: h(16), end: h(16, 40), title: "Chemistry Homework", category: "study", change: "moved" },
  { id: "t-thu-methods", day: "Thu", start: h(17), end: h(17, 40), title: "Methods Revision", category: "study", change: "kept" },
];

/* ------------------------------------------------------------------ */
/* AI Mentor                                                           */
/* ------------------------------------------------------------------ */

export interface MentorExample {
  id: string;
  prompt: string;
  response: string;
  basis: string[];
}

export const mentorExamples: MentorExample[] = [
  {
    id: "tonight",
    prompt: "What should I work on tonight?",
    response:
      "Methods. Your test is Friday and you’ve covered two of the four topics. Start with Complex Numbers Practice for 45 minutes, then English if you still have energy. The draft isn’t due until Thursday.",
    basis: ["Methods test Fri", "2 of 4 topics covered", "English due Thu"],
  },
  {
    id: "off",
    prompt: "Can I take tonight off?",
    response:
      "Yes. Tonight’s English session can move to Wednesday afternoon without touching Thursday’s deadline. Methods stays on Thursday, so you still get a full revision block before Friday.",
    basis: ["Wed 4:30–5:30 free", "English due Thu", "Methods test Fri"],
  },
  {
    id: "behind",
    prompt: "How behind am I on Chemistry?",
    response:
      "About 40 minutes. You skipped Tuesday’s Equilibrium Review. It fits on Thursday at 4:00, which still leaves the weekend clear before Chemistry homework is due Monday.",
    basis: ["Skipped Tue review", "Thu 4:00–4:45 free", "Homework due Mon"],
  },
  {
    id: "training",
    prompt: "Move everything after training.",
    response:
      "Done. English Essay now starts at 7:15 and Chemistry Homework is shortened to 30 minutes, so you still finish by 9:00 and keep your 10:30 sleep target.",
    basis: ["Training ends 7:00", "Sleep target 10:30", "Chemistry set is short"],
  },
  {
    id: "test",
    prompt: "I have a Maths test next Thursday.",
    response:
      "Added. I’ve placed three Methods revision blocks across next week and moved Chemistry homework to Tuesday, so Wednesday night stays free before the test.",
    basis: ["3 revision blocks", "Chemistry → Tue", "Wed night clear"],
  },
  {
    id: "why",
    prompt: "Why did you schedule English today?",
    response:
      "Your essay draft is due Thursday and you have basketball Wednesday evening. Today is the only afternoon this week with 70 uninterrupted minutes. Leaving it later would mean writing the night before it’s due.",
    basis: ["Essay due Thu", "Basketball Wed 6:00", "70 min free today"],
  },
];

export const mentorDefaultId = "why";
