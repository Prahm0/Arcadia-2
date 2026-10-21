// node --test education.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { courseFor, coursesFor, defaultCourse, weeklyMinutesForGrade } = await import("../shared/education.ts");

test("each country starts on its own course, and Australia follows the state", () => {
  assert.equal(defaultCourse("AU", "NSW").key, "hsc");
  assert.equal(defaultCourse("AU", "VIC").key, "vce");
  assert.equal(defaultCourse("AU", null).key, "qce");
  assert.equal(defaultCourse("GB").key, "a_levels");
  assert.equal(defaultCourse("US").key, "us_high_school");
  assert.equal(defaultCourse("FR").key, "high_school");
});

test("the IB and uni are offered everywhere, after the country's own courses", () => {
  const keys = coursesFor("US").map((course) => course.key);
  assert.deepEqual(keys, ["us_high_school", "ib", "uni"]);
  assert.deepEqual(coursesFor("AU", "VIC").map((course) => course.key), ["vce", "ib", "uni"]);
  assert.deepEqual(coursesFor("GB").map((course) => course.key), ["a_levels", "gcse", "ib", "uni"]);
  assert.deepEqual(coursesFor("FR").map((course) => course.key), ["high_school", "ib", "uni"]);
});

test("accounts from before courses get a sensible one from their grade and country", () => {
  assert.equal(courseFor({ country: "AU", state: "QLD", grade: "Year 12" }).key, "qce");
  assert.equal(courseFor({ country: null, grade: "Second year+" }).key, "uni");
  assert.equal(courseFor({ course: "ib", country: "AU", grade: "IB Year 2" }).key, "ib");
});

test("weekly study time reads every course's year labels", () => {
  // Unchanged for existing Australian students.
  assert.equal(weeklyMinutesForGrade("Year 12"), 180);
  assert.equal(weeklyMinutesForGrade("Year 10"), 120);
  assert.equal(weeklyMinutesForGrade("Year 9"), 120);
  assert.equal(weeklyMinutesForGrade("First year uni"), 240);
  assert.equal(weeklyMinutesForGrade("Second year+"), 240);
  assert.equal(weeklyMinutesForGrade(null), 150);
  // New courses.
  assert.equal(weeklyMinutesForGrade("Grade 12"), 180);
  assert.equal(weeklyMinutesForGrade("Grade 10"), 120);
  assert.equal(weeklyMinutesForGrade("Year 13"), 180);
  assert.equal(weeklyMinutesForGrade("6th Year"), 180);
  assert.equal(weeklyMinutesForGrade("IB Year 1"), 180);
  assert.equal(weeklyMinutesForGrade("Postgrad"), 240);
});

test("Australian courses include Year 9 without treating it as a senior year", () => {
  for (const course of [defaultCourse("AU", "QLD"), defaultCourse("AU", "NSW"), defaultCourse("AU", "VIC")]) {
    assert.ok(course.years.includes("Year 9"));
    assert.ok(!course.finalYears.includes("Year 9"));
  }
});
