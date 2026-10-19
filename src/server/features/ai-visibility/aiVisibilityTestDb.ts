import { readdirSync, readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import type { runBatch } from "@/db/runBatch";

/**
 * In-memory SQLite with every production migration applied, so AI visibility
 * services run their real queries, indexes and constraints in tests. Create it
 * inside `vi.hoisted` and serve it from mocked `@/db` and `@/db/runBatch`.
 */
export async function createAiVisibilityTestDb() {
  const client = createClient({ url: "file::memory:" });
  const migrations = sort(
    readdirSync("drizzle/sqlite").filter((file) => file.endsWith(".sql")),
    (a, b) => a.localeCompare(b),
  );
  for (const file of migrations)
    await client.executeMultiple(
      readFileSync(`drizzle/sqlite/${file}`, "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  const db = drizzle(client);
  // D1 runs each batch on its own, so concurrent batches never interleave.
  // Queue them to match: credit holds rely on it.
  let previousBatch: Promise<unknown> = Promise.resolve();
  /** Runs the production statements in order against SQLite, one batch at a time. */
  const batch: typeof runBatch = (build) => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- libsql exposes the D1 SQLite query-builder surface the repositories use
    const executor = db as unknown as Parameters<typeof build>[0];
    const run = previousBatch.then(async () => {
      for (const statement of build(executor)) await statement;
    });
    previousBatch = run.catch(() => undefined);
    return run;
  };
  /** Clears every row, then adds organization "organization" and its project "project". */
  const seedProject = () =>
    client.executeMultiple(`
      DELETE FROM organization;
      INSERT INTO organization (id, name, slug, created_at)
        VALUES ('organization', 'Organization', 'organization', 0);
      INSERT INTO projects (id, organization_id, name, domain)
        VALUES ('project', 'organization', 'OpenSEO', 'openseo.so');
    `);
  return { client, db, runBatch: batch, seedProject };
}
