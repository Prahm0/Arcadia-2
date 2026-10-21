/**
 * The school and uni courses Arcadia plans for, so onboarding, the profile,
 * the planner and Arcad all speak the student's own system: their year
 * levels, their subjects and the result they're aiming for (an ATAR, an IB
 * score, A-level grades, a GPA...).
 *
 * A course is stored on the profile by key (profiles.course). Accounts made
 * before courses existed have none; `courseFor` falls back to the country's
 * usual one so they still get sensible defaults.
 */

export interface CourseGoal {
  /** "ATAR target", "Predicted grades"... */
  label: string;
  /** An example in the course's own terms. */
  placeholder: string;
  /** A number between these, when the goal is a single score (ATAR, IB, CAO points). */
  range?: { min: number; max: number; step: number };
}

export interface Course {
  key: string;
  /** What students call it: "HSC", "IB Diploma", "A-levels". */
  label: string;
  /** A few words under the label: "NSW", "Any country". */
  detail: string;
  /** Countries (ISO alpha-2) where it's offered as a matter of course; empty means anywhere. */
  countries: string[];
  /** For Australian courses, the states that use it. */
  states?: string[];
  /** Year levels in the course's own words, youngest first. */
  years: string[];
  /** The year levels that are the final, high-stakes ones. */
  finalYears: string[];
  goal: CourseGoal | null;
  /** Suggestions in onboarding; students can always type their own. */
  subjects: string[];
  /** One line Arcad reads about how the course works. */
  about: string;
}

// Arcadia's senior-course suggestions begin in Year 10, but Year 9 students
// can still use the planner with the same flexible subject setup.
const AU_YEARS = ["Year 9", "Year 10", "Year 11", "Year 12"];
const ATAR: CourseGoal = { label: "ATAR target", placeholder: "90", range: { min: 30, max: 99.95, step: 0.05 } };
const AU_LANGUAGES = ["Japanese", "Chinese", "French", "Spanish", "German", "Italian", "Indonesian"];

/** Senior subjects most Australian states share, for states without their own list here. */
const AU_GENERAL_SUBJECTS = [
  "General Mathematics",
  "Mathematical Methods",
  "Specialist Mathematics",
  "Essential Mathematics",
  "English",
  "Literature",
  "English as an Additional Language",
  "Biology",
  "Chemistry",
  "Physics",
  "Psychology",
  "Modern History",
  "Ancient History",
  "Geography",
  "Legal Studies",
  "Economics",
  "Business",
  "Accounting",
  "Digital Technologies",
  "Design",
  "Visual Art",
  "Music",
  "Drama",
  "Physical Education",
  "Health",
  ...AU_LANGUAGES,
];

export const COURSES: Course[] = [
  {
    key: "qce",
    label: "QCE",
    detail: "Queensland",
    countries: ["AU"],
    states: ["QLD"],
    years: AU_YEARS,
    finalYears: ["Year 11", "Year 12"],
    goal: ATAR,
    subjects: [
      "General Mathematics",
      "Mathematical Methods",
      "Specialist Mathematics",
      "Essential Mathematics",
      "English",
      "Literature",
      "English as an Additional Language",
      "Biology",
      "Chemistry",
      "Physics",
      "Psychology",
      "Marine Science",
      "Modern History",
      "Ancient History",
      "Geography",
      "Legal Studies",
      "Economics",
      "Business",
      "Study of Religion",
      "Digital Solutions",
      "Design",
      "Engineering",
      "Music",
      "Visual Art",
      "Drama",
      "Film, Television & New Media",
      "Physical Education",
      "Health",
      ...AU_LANGUAGES,
    ],
    about: "Queensland Certificate of Education: internal assessments (IA1 to IA3) and an external exam per subject, feeding an ATAR.",
  },
  {
    key: "hsc",
    label: "HSC",
    detail: "New South Wales",
    countries: ["AU"],
    states: ["NSW"],
    years: AU_YEARS,
    finalYears: ["Year 11", "Year 12"],
    goal: ATAR,
    subjects: [
      "Mathematics Standard",
      "Mathematics Advanced",
      "Mathematics Extension 1",
      "Mathematics Extension 2",
      "English Standard",
      "English Advanced",
      "English Extension 1",
      "English Extension 2",
      "Biology",
      "Chemistry",
      "Physics",
      "Investigating Science",
      "Earth and Environmental Science",
      "Economics",
      "Business Studies",
      "Legal Studies",
      "Modern History",
      "Ancient History",
      "Geography",
      "Studies of Religion",
      "PDHPE",
      "Software Engineering",
      "Engineering Studies",
      "Visual Arts",
      "Music",
      "Drama",
      ...AU_LANGUAGES,
    ],
    about: "NSW Higher School Certificate: school-based assessments plus the HSC exams in Year 12, feeding an ATAR.",
  },
  {
    key: "vce",
    label: "VCE",
    detail: "Victoria",
    countries: ["AU"],
    states: ["VIC"],
    years: AU_YEARS,
    finalYears: ["Year 11", "Year 12"],
    goal: ATAR,
    subjects: [
      "General Mathematics",
      "Mathematical Methods",
      "Specialist Mathematics",
      "Foundation Mathematics",
      "English",
      "English Language",
      "Literature",
      "Biology",
      "Chemistry",
      "Physics",
      "Psychology",
      "Accounting",
      "Business Management",
      "Economics",
      "Legal Studies",
      "History: Revolutions",
      "Australian History",
      "Geography",
      "Health and Human Development",
      "Physical Education",
      "Visual Communication Design",
      "Studio Arts",
      "Algorithmics",
      "Applied Computing",
      "Music",
      "Drama",
      ...AU_LANGUAGES,
    ],
    about: "Victorian Certificate of Education: SACs during the year and end-of-year exams, scaled into a study score and an ATAR.",
  },
  {
    key: "sace",
    label: "SACE",
    detail: "South Australia and NT",
    countries: ["AU"],
    states: ["SA", "NT"],
    years: AU_YEARS,
    finalYears: ["Year 11", "Year 12"],
    goal: ATAR,
    subjects: AU_GENERAL_SUBJECTS,
    about: "South Australian Certificate of Education: Stage 1 and Stage 2 subjects, school assessment plus external assessment, feeding an ATAR.",
  },
  {
    key: "wace",
    label: "WACE",
    detail: "Western Australia",
    countries: ["AU"],
    states: ["WA"],
    years: AU_YEARS,
    finalYears: ["Year 11", "Year 12"],
    goal: ATAR,
    subjects: AU_GENERAL_SUBJECTS,
    about: "Western Australian Certificate of Education: ATAR courses with school assessment and WACE exams.",
  },
  {
    key: "tce",
    label: "TCE",
    detail: "Tasmania",
    countries: ["AU"],
    states: ["TAS"],
    years: AU_YEARS,
    finalYears: ["Year 11", "Year 12"],
    goal: ATAR,
    subjects: AU_GENERAL_SUBJECTS,
    about: "Tasmanian Certificate of Education: TASC courses with internal and external assessment, feeding an ATAR.",
  },
  {
    key: "act_ssc",
    label: "ACT SSC",
    detail: "ACT",
    countries: ["AU"],
    states: ["ACT"],
    years: AU_YEARS,
    finalYears: ["Year 11", "Year 12"],
    goal: ATAR,
    subjects: AU_GENERAL_SUBJECTS,
    about: "ACT Senior Secondary Certificate: school-based assessment moderated by the AST, feeding an ATAR.",
  },
  {
    key: "ncea",
    label: "NCEA",
    detail: "New Zealand",
    countries: ["NZ"],
    years: ["Year 11", "Year 12", "Year 13"],
    finalYears: ["Year 12", "Year 13"],
    goal: { label: "What you're aiming for", placeholder: "Level 3 with Excellence, UE" },
    subjects: [
      "English",
      "Mathematics with Calculus",
      "Mathematics with Statistics",
      "Biology",
      "Chemistry",
      "Physics",
      "Science",
      "Geography",
      "History",
      "Classical Studies",
      "Economics",
      "Accounting",
      "Business Studies",
      "Media Studies",
      "Digital Technologies",
      "Physical Education",
      "Health",
      "Art Design",
      "Music",
      "Te Reo Māori",
      "French",
      "Spanish",
      "Japanese",
      "Chinese",
    ],
    about: "NCEA: credits from internal and external achievement standards, with Merit and Excellence endorsements and University Entrance.",
  },
  {
    key: "a_levels",
    label: "A-levels",
    detail: "UK",
    countries: ["GB"],
    years: ["Year 12", "Year 13"],
    finalYears: ["Year 12", "Year 13"],
    goal: { label: "Predicted grades", placeholder: "A*AA" },
    subjects: [
      "Maths",
      "Further Maths",
      "English Literature",
      "English Language",
      "Biology",
      "Chemistry",
      "Physics",
      "Psychology",
      "Economics",
      "Business",
      "History",
      "Geography",
      "Politics",
      "Sociology",
      "Computer Science",
      "Religious Studies",
      "Art and Design",
      "Music",
      "French",
      "Spanish",
      "German",
    ],
    about: "A-levels: usually three subjects over two years, graded A* to E, mostly by exams at the end of Year 13.",
  },
  {
    key: "gcse",
    label: "GCSEs",
    detail: "UK",
    countries: ["GB"],
    years: ["Year 10", "Year 11"],
    finalYears: ["Year 11"],
    goal: { label: "Target grades", placeholder: "Mostly 8s and 9s" },
    subjects: [
      "Maths",
      "English Language",
      "English Literature",
      "Combined Science",
      "Biology",
      "Chemistry",
      "Physics",
      "History",
      "Geography",
      "Religious Studies",
      "Computer Science",
      "Business",
      "Art and Design",
      "Music",
      "Drama",
      "PE",
      "French",
      "Spanish",
      "German",
    ],
    about: "GCSEs: graded 9 to 1, mostly by exams at the end of Year 11.",
  },
  {
    key: "leaving_cert",
    label: "Leaving Cert",
    detail: "Ireland",
    countries: ["IE"],
    years: ["5th Year", "6th Year"],
    finalYears: ["5th Year", "6th Year"],
    goal: { label: "CAO points target", placeholder: "550", range: { min: 0, max: 625, step: 1 } },
    subjects: [
      "English",
      "Irish",
      "Maths",
      "Applied Maths",
      "Biology",
      "Chemistry",
      "Physics",
      "Agricultural Science",
      "Accounting",
      "Business",
      "Economics",
      "History",
      "Geography",
      "Computer Science",
      "Home Economics",
      "Art",
      "Music",
      "French",
      "Spanish",
      "German",
    ],
    about: "Leaving Certificate: exams at the end of 6th Year, Higher or Ordinary level, best six subjects counted for CAO points.",
  },
  {
    key: "us_high_school",
    label: "High school (AP)",
    detail: "US",
    countries: ["US"],
    years: ["Grade 9", "Grade 10", "Grade 11", "Grade 12"],
    finalYears: ["Grade 11", "Grade 12"],
    goal: { label: "GPA or test score target", placeholder: "3.9 GPA, 1500 SAT" },
    subjects: [
      "AP Calculus AB",
      "AP Calculus BC",
      "AP Statistics",
      "Precalculus",
      "Algebra II",
      "AP English Language",
      "AP English Literature",
      "English",
      "AP Biology",
      "AP Chemistry",
      "AP Physics 1",
      "Chemistry",
      "Biology",
      "AP US History",
      "AP World History",
      "AP Psychology",
      "AP Macroeconomics",
      "AP Computer Science A",
      "Spanish",
      "French",
      "SAT prep",
      "ACT prep",
    ],
    about: "US high school: semester grades build a GPA; AP exams in May are scored 1 to 5; the SAT or ACT is often part of college applications.",
  },
  {
    key: "ca_high_school",
    label: "High school",
    detail: "Canada",
    countries: ["CA"],
    years: ["Grade 10", "Grade 11", "Grade 12"],
    finalYears: ["Grade 11", "Grade 12"],
    goal: { label: "Average you're aiming for", placeholder: "92%" },
    subjects: [
      "Advanced Functions",
      "Calculus and Vectors",
      "Data Management",
      "English",
      "Biology",
      "Chemistry",
      "Physics",
      "History",
      "Geography",
      "Economics",
      "Accounting",
      "Business",
      "Computer Science",
      "French",
      "Spanish",
      "Art",
      "Music",
      "Physical Education",
    ],
    about: "Canadian high school: course marks in Grades 11 and 12 make up the average universities look at.",
  },
  {
    key: "ib",
    label: "IB Diploma",
    detail: "Any country",
    countries: [],
    years: ["IB Year 1", "IB Year 2"],
    finalYears: ["IB Year 1", "IB Year 2"],
    goal: { label: "IB score target", placeholder: "38", range: { min: 24, max: 45, step: 1 } },
    subjects: [
      "Maths: Analysis and Approaches",
      "Maths: Applications and Interpretation",
      "English A: Language and Literature",
      "English A: Literature",
      "Biology",
      "Chemistry",
      "Physics",
      "Psychology",
      "Economics",
      "Business Management",
      "History",
      "Geography",
      "Computer Science",
      "Visual Arts",
      "Spanish B",
      "French B",
      "Theory of Knowledge",
      "Extended Essay",
    ],
    about: "IB Diploma: six subjects (three at Higher Level) scored 1 to 7, plus up to 3 points from TOK and the Extended Essay, out of 45. Internal assessments run through the two years; exams are at the end.",
  },
  {
    key: "high_school",
    label: "High school",
    detail: "Anywhere",
    countries: [],
    years: ["Year 10", "Year 11", "Year 12", "Year 13"],
    finalYears: ["Year 11", "Year 12", "Year 13"],
    goal: { label: "What you're aiming for", placeholder: "Your target result" },
    subjects: [
      "Maths",
      "English",
      "Biology",
      "Chemistry",
      "Physics",
      "History",
      "Geography",
      "Economics",
      "Business",
      "Computer Science",
      "Psychology",
      "Art",
      "Music",
      "Physical Education",
      "French",
      "Spanish",
    ],
    about: "Final years of high school.",
  },
  {
    key: "uni",
    label: "University",
    detail: "Any country",
    countries: [],
    years: ["First year uni", "Second year+", "Postgrad"],
    finalYears: [],
    goal: { label: "GPA or average you're aiming for", placeholder: "6.0 GPA, Distinction average" },
    subjects: [],
    about: "University: units or courses with assignments through the semester and exams at the end.",
  },
];

const BY_KEY = new Map(COURSES.map((course) => [course.key, course]));

export function courseByKey(key: string | null | undefined): Course | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

/** The course a student in this country (and Australian state) most likely does. */
export function defaultCourse(country: string | null | undefined, state?: string | null): Course {
  if (country === "AU") {
    return COURSES.find((course) => course.states?.includes(state ?? "")) ?? BY_KEY.get("qce")!;
  }
  return COURSES.find((course) => course.countries.includes(country ?? "")) ?? BY_KEY.get("high_school")!;
}

/** The courses to offer for a country: its own first, then the IB, uni and the general option. */
export function coursesFor(country: string | null | undefined, state?: string | null): Course[] {
  // In Australia the state decides the certificate, so only that one shows
  // (the state picker sits right above it).
  const local =
    country === "AU" ? [defaultCourse("AU", state)] : COURSES.filter((course) => course.countries.includes(country ?? ""));
  const anywhere = ["ib", "uni"].map((key) => BY_KEY.get(key)!);
  const general = local.length ? [] : [BY_KEY.get("high_school")!];
  return [...local, ...general, ...anywhere];
}

/**
 * The profile's course, or the country's usual one for accounts from before
 * courses. A grade that only one course uses ("Grade 12", "IB Year 2")
 * points at that course.
 */
export function courseFor(profile: { course?: string | null; country?: string | null; state?: string | null; grade?: string | null }): Course {
  const saved = courseByKey(profile.course);
  if (saved) return saved;
  const grade = profile.grade ?? "";
  if (/uni|postgrad|year\+/i.test(grade)) return BY_KEY.get("uni")!;
  if (/^ib /i.test(grade)) return BY_KEY.get("ib")!;
  return defaultCourse(profile.country, profile.state);
}

/**
 * Starting minutes a week per subject, from the year level: more in the final
 * years, most at uni. Works on any course's labels ("Year 12", "Grade 12",
 * "6th Year", "IB Year 2"), and on accounts with no course saved.
 */
export function weeklyMinutesForGrade(grade: string | null | undefined): number {
  const text = (grade ?? "").trim().toLowerCase();
  if (!text) return 150;
  if (/uni|postgrad|year\+/.test(text)) return 240;
  if (/^ib year/.test(text)) return 180;
  const sixth = /^(5th|6th) year$/.exec(text);
  if (sixth) return 180;
  const numbered = /^(?:year|grade)\s*(\d{1,2})$/.exec(text);
  if (numbered) return Number(numbered[1]) >= 11 ? 180 : 120;
  return 150;
}
