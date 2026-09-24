import { afterAll, beforeAll, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createTestHarness, type TestHarness } from './helpers/app.js';
import { down, up } from '../src/db/migrations/0006_markflow_names.js';

let h: TestHarness;
beforeAll(async () => {
  h = await createTestHarness();
});
afterAll(async () => {
  await h.close();
});

it('brand migration preserves rows, sequence defaults and references, and can be reversed', async () => {
  await h.ctx.db.transaction().execute(async (trx) => {
    await sql`CREATE SCHEMA rename_test`.execute(trx);
    await sql`SET LOCAL search_path TO rename_test`.execute(trx);
    await sql`CREATE TABLE lingshu_dataset (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL)`.execute(
      trx,
    );
    await sql`CREATE TABLE task_reference (source_id BIGINT REFERENCES lingshu_dataset(id))`.execute(
      trx,
    );
    await sql`INSERT INTO lingshu_dataset (name) VALUES ('preserved')`.execute(trx);
    await sql`INSERT INTO task_reference VALUES (1)`.execute(trx);

    await up(trx);
    await up(trx);
    const original = await sql<{
      id: number;
      name: string;
    }>`SELECT * FROM markflow_dataset`.execute(trx);
    expect(original.rows).toEqual([{ id: 1, name: 'preserved' }]);
    const inserted = await sql<{
      id: number;
    }>`INSERT INTO markflow_dataset (name) VALUES ('next') RETURNING id`.execute(trx);
    expect(inserted.rows[0]?.id).toBe(2);
    const reference = await sql<{
      name: string;
    }>`SELECT d.name FROM task_reference t JOIN markflow_dataset d ON d.id=t.source_id`.execute(
      trx,
    );
    expect(reference.rows[0]?.name).toBe('preserved');
    const leftovers = await sql<{
      count: number;
    }>`SELECT COUNT(*)::int AS count FROM pg_class WHERE relnamespace='rename_test'::regnamespace AND starts_with(relname, 'lingshu_')`.execute(
      trx,
    );
    expect(leftovers.rows[0]?.count).toBe(0);

    await down(trx);
    expect(
      (
        await sql<{ count: number }>`SELECT COUNT(*)::int AS count FROM lingshu_dataset`.execute(
          trx,
        )
      ).rows[0]?.count,
    ).toBe(2);
    await sql`SET LOCAL search_path TO public`.execute(trx);
    await sql`DROP SCHEMA rename_test CASCADE`.execute(trx);
  });
});
