# Provenance worksheet

`git-worksheet.csv` lists every merged pull request up to 5 October 2026, with the GitHub author and the backend files each one touched.

Rows marked `core_to_scheduler = Y` touch the scheduling engine and matter most.

**What to do:** fill in the `YOUR_ROLE` column for every core row, and for any other row the report mentions:

- **implemented**: you specified it and directed the build;
- **co-developed**: you and someone else;
- **reviewed**: someone else built it and you reviewed it;
- **collaborator**: someone else's work;
- **not me**.

The GitHub author is evidence, not proof. AI tools committed under your account, and the co-developer's PRs may contain your ideas, or the other way round. Put specifics in `notes`. The report's contribution table is built from this file once you've verified it.
