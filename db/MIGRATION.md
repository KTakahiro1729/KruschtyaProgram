# D1 Migration Plan (Stopwatch schema)

The new stopwatch model replaces `manual_time`/`current_time_offset` with `game_time_elapsed` and `last_resumed_at` on the `sessions` table. Because D1 does not support `ALTER TABLE`, you must recreate the database to adopt the new columns.

## Steps for a clean rebuild
1. **Export any data you need to keep**
   - Download chat logs per session via `/api/sessions/{id}/logs` or export tables with `wrangler d1 execute` if required.
2. **Delete the existing database**
   - Remove the D1 binding from the Cloudflare dashboard or drop the database locally.
3. **Recreate the database from the updated schema**
   - Run `wrangler d1 execute dice-db --local --file=./db/schema.sql` (or the remote equivalent) to apply the new tables.
4. **Seed demo data (optional)**
   - The schema ships with a demo session (`id: 0000`, password `demo`). Reapply `schema.sql` if you need the seed after a reset.

## Manual migration (if data must be preserved)
If you cannot discard existing data, create a **new** D1 database using the updated `schema.sql`, then migrate rows manually:
- Copy all `users`, `session_tokens`, `chat_messages`, and `quantum_numbers` rows as-is.
- For each session, initialize `game_time_elapsed` to the value of the old in-game clock (e.g., `manual_time + current_time_offset` if stored) and set `last_resumed_at` to `NULL` to keep it paused. If the session should be running, set `last_resumed_at` to the current epoch milliseconds.
- Update application bindings to point to the new database once the copy completes.
