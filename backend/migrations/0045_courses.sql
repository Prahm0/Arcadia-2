-- Arcadia beyond Australia: the student's course (HSC, IB Diploma, A-levels,
-- a US high school, uni...; keys in shared/education.ts) and the result
-- they're aiming for in that course's own terms ("A*AA", "38", "3.9 GPA").
-- An ATAR stays in atar_target as a number. Both null for accounts made
-- before; the app falls back to the country's usual course.
ALTER TABLE profiles ADD COLUMN course TEXT;
ALTER TABLE profiles ADD COLUMN goal_target TEXT;
