-- Stores the selected weekdays for commitments using the custom recurrence.
-- Values are a JSON array of JavaScript weekday numbers (Sun = 0, Mon = 1).
ALTER TABLE `commitments` ADD COLUMN `custom_weekdays` text;
