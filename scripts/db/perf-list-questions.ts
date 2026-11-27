/**
 * Phase 04D — measured evidence for the staff question list.
 *
 *   ICT_PERF_BENCH=1 ICT_PERF_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/ict_perf_04d \
 *     node scripts/db/perf-list-questions.ts --out docs/database/perf/04d-before.md
 *
 * WHAT IT MEASURES
 * ----------------
 * Six required cases (plus two that Phase 04D adds, marked as such):
 *
 *   1. no filter
 *   2. chapter only
 *   3. chapter + type + status
 *   4. board + academic year
 *   5. tag
 *   6. cursor pagination at page 50
 *   7. college only            (04D — the filter is new; the index is not)
 *   8. q = "কম্পিউটার" search    (04D — does not exist before migration 0003)
 *
 * For each case it runs the statements Prisma issues for
 * `listQuestionsForStaff` — the page query plus the two relation loads — under
 * `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)`, and then repeats the page query to
 * report a median and best wall time. The EXPLAIN output is written verbatim:
 * the report is machine-produced, so no plan in it can be invented or retyped.
 *
 * The predicates come from scripts/db/list-query-sql.ts, which consumes the
 * same `ListFilterSpec` the production filter builder produces (see that file
 * and tests/integration/questions/staff-list-filters.test.ts).
 *
 * WHAT IT DOES NOT DO
 * -------------------
 *   · It never writes to a table: only SELECT, EXPLAIN and ANALYZE (statistics,
 *     which every plan depends on being fresh).
 *   · It refuses production/staging exactly like the seeder (perf-guard.ts),
 *     with ICT_PERF_BENCH=1 as the opt-in.
 *   · It makes no claim about Prisma's own overhead (connection, row mapping):
 *     the numbers are server-side… plus the round trip, which is what the
 *     median includes and the EXPLAIN "Execution Time" excludes.
 */

import { writeFileSync } from 'node:fs';

import pg from 'pg';

import type { ListFilterSpec } from '../../server/questions/authoring/list-filters.ts';
import {
  renderListQuery,
  renderTagStatement,
  renderVersionStatement,
  type RenderedStatement,
} from './list-query-sql.ts';
import { describePerfTarget, resolvePerfTarget, verifyPerfDatabase, PERF_BENCH_OPT_IN } from './perf-guard.ts';

const { Client } = pg;

const PAGE_SIZE = 20;

interface BenchCase {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly spec: (fixtures: Fixtures) => ListFilterSpec;
  /** Runs only when the column exists (the feature post-dates the baseline). */
  readonly requiresSearchColumn?: boolean;
}

interface Fixtures {
  readonly levelId: string;
  readonly subjectId: string;
  readonly chapterId: string;
  readonly tagId: string;
  readonly boardId: string;
  readonly yearId: string;
  readonly collegeId: string;
  readonly page50Cursor: { createdAt: Date; id: string };
}

function cases(): readonly BenchCase[] {
  return [
    {
      id: 'no-filter',
      title: '1. No filter',
      note: 'The default staff list: newest 20 questions overall.',
      spec: () => ({ searchTokens: [], limit: PAGE_SIZE }),
    },
    {
      id: 'chapter',
      title: '2. Chapter only',
      note: 'One of six chapters — low selectivity (≈25% of the bank).',
      spec: (f) => ({ chapterId: f.chapterId, searchTokens: [], limit: PAGE_SIZE }),
    },
    {
      id: 'chapter-type-status',
      title: '3. Chapter + type + status',
      note: 'Chapter 3 + MCQ + PUBLISHED: the common authoring screen.',
      spec: (f) => ({
        chapterId: f.chapterId,
        type: 'MCQ',
        status: 'PUBLISHED',
        searchTokens: [],
        limit: PAGE_SIZE,
      }),
    },
    {
      id: 'board-year',
      title: '4. Board + academic year',
      note: 'Dhaka board 2023 — one attribution row must hold both.',
      spec: (f) => ({
        boardId: f.boardId,
        academicYearId: f.yearId,
        searchTokens: [],
        limit: PAGE_SIZE,
      }),
    },
    {
      id: 'tag',
      title: '5. Tag',
      note: 'A single tag with the long tail: most questions carry one or two.',
      spec: (f) => ({ tagId: f.tagId, searchTokens: [], limit: PAGE_SIZE }),
    },
    {
      id: 'page-50',
      title: '6. Cursor pagination at page 50',
      note: 'Keyset cursor at row 1,000; the query after it is page 51.',
      spec: (f) => ({ searchTokens: [], limit: PAGE_SIZE, cursor: f.page50Cursor }),
    },
    {
      id: 'college',
      title: '7. College only (added by 04D)',
      note: '200 colleges, one source row each: selective but not unique.',
      spec: (f) => ({ collegeId: f.collegeId, searchTokens: [], limit: PAGE_SIZE }),
    },
    {
      id: 'search-english',
      title: '8a. Search: "computer" (04D, English word)',
      note: 'Whole-word English hit in the maintained projection.',
      spec: () => ({ searchTokens: ['computer'], limit: PAGE_SIZE }),
      requiresSearchColumn: true,
    },
    {
      id: 'search-bangla',
      title: '8b. Search: "কম্পিউটার" (04D, Bangla word)',
      note: 'Bangla word — no stemming is applied or claimed.',
      spec: () => ({ searchTokens: ['কম্পিউটার'.normalize('NFC')], limit: PAGE_SIZE }),
      requiresSearchColumn: true,
    },
    {
      id: 'search-conjunct',
      title: '8c. Search: "ক্ষ" (04D, Bangla conjunct, partial)',
      note: 'Two-character conjunct inside a word — a trigram partial match.',
      spec: () => ({ searchTokens: ['ক্ষ'.normalize('NFC')], limit: PAGE_SIZE }),
      requiresSearchColumn: true,
    },
    {
      id: 'search-mixed',
      title: '8d. Search: "html ওয়েব" (04D, mixed Bangla + English)',
      note: 'Two tokens, both required in the same version.',
      spec: () => ({ searchTokens: ['html', 'ওয়েব'.normalize('NFC')], limit: PAGE_SIZE }),
      requiresSearchColumn: true,
    },
    {
      id: 'search-no-match',
      title: '8e. Search: a token that matches nothing (04D)',
      note:
        'The worst case for an ordered walk: with no matches to stop early on, a scan of ' +
        'questions ordered by created_at must be abandoned. This is the case the GIN index is for.',
      spec: () => ({ searchTokens: ['zzznomatchzzz'], limit: PAGE_SIZE }),
      requiresSearchColumn: true,
    },
    {
      id: 'search-option-only',
      title: '8f. Search: a token that exists only in option text (04D)',
      note:
        'The dataset plants zzoptioncanaryzz in one option of every 97th question. A hit ' +
        'proves option text is in the projection; the matching rubric canary ' +
        'zzrubriccanaryzz must never match (asserted in the integration suite).',
      spec: () => ({ searchTokens: ['zzoptioncanaryzz'], limit: PAGE_SIZE }),
      requiresSearchColumn: true,
    },
  ];
}

/* ── plan parsing ────────────────────────────────────────────────────────── */

interface PlanFacts {
  readonly executionMs: number | null;
  readonly planningMs: number | null;
  /** Estimated rows for the first (driving) scan node. */
  readonly scanEstimated: string;
  /** Actual rows for the first (driving) scan node. */
  readonly scanActual: string;
  readonly sharedHit: number;
  readonly sharedRead: number;
  readonly sorts: number;
  readonly scans: string;
  readonly indexNames: string;
}

function parsePlan(plan: string): PlanFacts {
  const execution = /Execution Time: ([\d.]+) ms/.exec(plan);
  const planning = /Planning Time: ([\d.]+) ms/.exec(plan);
  // The driving scan: the first node in the plan that reads a relation. Its
  // estimated-vs-actual row count is what a reader checks when deciding whether
  // an index is being used for the right reason.
  const scanLine = plan
    .split('\n')
    .find((line) => /(Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan) on /.test(line));
  const scanEstimate = scanLine === undefined ? null : /rows=(\d+)/.exec(scanLine);
  const scanActualMatch =
    scanLine === undefined ? null : /actual time=[\d.]+\.\.([\d.]+) rows=(\d+)/.exec(scanLine);
  let sharedHit = 0;
  let sharedRead = 0;
  for (const line of plan.split('\n')) {
    const buffers = /Buffers: shared hit=(\d+)(?: read=(\d+))?/.exec(line);
    if (buffers !== null) {
      sharedHit += Number(buffers[1] ?? 0);
      sharedRead += Number(buffers[2] ?? 0);
    }
  }
  const scanNodes = plan.match(/(Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan|Bitmap Index Scan) on [\w.]+/g) ?? [];
  const indexes = new Set([
    // "Index Scan using ix_x on …" / "Index Only Scan using ix_x on …"
    ...(plan.match(/using [a-z0-9_]+ on /g) ?? []).map((m) => m.replace(/^using /, '').replace(/ on $/, '')),
    // "Bitmap Index Scan on ix_x" (PostgreSQL omits "using" for bitmap scans)
    ...(plan.match(/Bitmap Index Scan on [a-z0-9_]+/g) ?? []).map((m) => m.replace('Bitmap Index Scan on ', '')),
  ]);
  return {
    executionMs: execution === null ? null : Number(execution[1]),
    planningMs: planning === null ? null : Number(planning[1]),
    scanEstimated: scanEstimate?.[1] ?? '?',
    scanActual: scanActualMatch?.[2] ?? '?',
    sharedHit,
    sharedRead,
    sorts: (plan.match(/Sort Method:/g) ?? []).length,
    scans: scanNodes.length === 0 ? '—' : [...new Set(scanNodes.map((s) => s.split(' on ')[0] ?? s))].join(', '),
    indexNames: indexes.size === 0 ? '—' : [...indexes].join(', '),
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return Number.NaN;
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

interface StatementResult {
  readonly statement: RenderedStatement;
  readonly plan: string;
  readonly facts: PlanFacts;
  readonly wallMs: readonly number[];
}

async function measureStatement(
  client: pg.Client,
  statement: RenderedStatement,
  repetitions: number,
): Promise<StatementResult> {
  // Warm the cache once, then EXPLAIN three times and keep the middle plan text
  // so the report shows a representative plan rather than a cold one.
  await client.query(statement.sql, statement.values);
  const plans: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const result = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, VERBOSE OFF, FORMAT TEXT) ${statement.sql}`,
      statement.values,
    );
    plans.push(result.rows.map((row: { 'QUERY PLAN': string }) => row['QUERY PLAN']).join('\n'));
  }
  const factsPerRun = plans.map(parsePlan);
  const sortedByExecution = [...factsPerRun].sort(
    (a, b) => (a.executionMs ?? 0) - (b.executionMs ?? 0),
  );
  const representative = sortedByExecution[Math.floor(sortedByExecution.length / 2)] ?? factsPerRun[0];
  const representativeIndex = representative === undefined ? 0 : factsPerRun.indexOf(representative);

  const wallMs: number[] = [];
  for (let i = 0; i < repetitions; i += 1) {
    const started = process.hrtime.bigint();
    await client.query(statement.sql, statement.values);
    wallMs.push(Number(process.hrtime.bigint() - started) / 1_000_000);
  }

  return {
    statement,
    plan: plans[representativeIndex] ?? '',
    facts:
      representative ?? {
        executionMs: null,
        planningMs: null,
        scanEstimated: '?',
        scanActual: '?',
        sharedHit: 0,
        sharedRead: 0,
        sorts: 0,
        scans: '—',
        indexNames: '—',
      },
    wallMs,
  };
}

/* ── fixtures ────────────────────────────────────────────────────────────── */

async function loadFixtures(client: pg.Client): Promise<Fixtures> {
  const one = async <T extends Record<string, unknown>>(sql: string): Promise<T> => {
    const result = await client.query(sql);
    const row = result.rows[0] as T | undefined;
    if (row === undefined) throw new Error(`fixture query returned no row: ${sql}`);
    return row;
  };
  const level = await one<{ id: string }>(
    `SELECT id FROM education_levels ORDER BY code LIMIT 1`,
  );
  const subject = await one<{ id: string }>(`SELECT id FROM subjects ORDER BY code LIMIT 1`);
  // Chapter 3 is the biggest in the dataset (≈25%): the least selective chapter.
  const chapter = await one<{ id: string }>(
    `SELECT id FROM chapters ORDER BY chapter_number LIMIT 1 OFFSET 2`,
  );
  const tag = await one<{ id: string }>(
    `SELECT tag_id AS id FROM question_tags GROUP BY tag_id ORDER BY count(*) DESC LIMIT 1`,
  );
  // Dhaka is the largest board; 2023 is a mid-range year.
  const board = await one<{ id: string }>(
    `SELECT id FROM boards WHERE code = 'DHAKA'`,
  );
  const year = await one<{ id: string }>(
    `SELECT id FROM academic_years WHERE label = '2023'`,
  );
  const college = await one<{ id: string }>(
    `SELECT college_id AS id FROM question_sources
      WHERE college_id IS NOT NULL
      GROUP BY college_id ORDER BY count(*) DESC LIMIT 1`,
  );
  const cursorRow = await one<{ created_at: Date; id: string }>(
    `SELECT created_at, id FROM questions ORDER BY created_at DESC, id DESC OFFSET ${String(
      49 * PAGE_SIZE,
    )} LIMIT 1`,
  );
  return {
    levelId: level.id,
    subjectId: subject.id,
    chapterId: chapter.id,
    tagId: tag.id,
    boardId: board.id,
    yearId: year.id,
    collegeId: college.id,
    page50Cursor: { createdAt: cursorRow.created_at, id: cursorRow.id },
  };
}

/* ── report ──────────────────────────────────────────────────────────────── */

function header(title: string, environment: Record<string, string>): string {
  const lines = [
    `# ${title}`,
    '',
    '> **Machine-generated.** Every plan below was captured by',
    '> `scripts/db/perf-list-questions.ts` from a live PostgreSQL server that ran',
    '> the statements `listQuestionsForStaff` issues. Nothing in this file was',
    '> typed by hand; re-running the harness reproduces it.',
    '',
    '## Environment',
    '',
    '| Fact | Value |',
    '| --- | --- |',
  ];
  for (const [key, value] of Object.entries(environment)) {
    lines.push(`| ${key} | ${value.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function caseSection(
  benchCase: BenchCase,
  results: readonly StatementResult[],
  mainMedian: number,
  totalMedian: number,
  spec: ListFilterSpec,
  summary: string,
): string {
  const lines: string[] = [];
  lines.push(`### ${benchCase.title}`, '', `${benchCase.note}`, '');
  lines.push(`Spec: \`${JSON.stringify(spec)}\``);
  lines.push('');
  lines.push(summary);
  lines.push('');
  const main = results[0];
  if (main !== undefined) {
    lines.push(
      `**Page query** — median wall ${mainMedian.toFixed(2)} ms over ` +
        `${String(main.wallMs.length)} runs (best ` +
        `${Math.min(...main.wallMs).toFixed(2)} ms); EXPLAIN execution ` +
        `${(main.facts.executionMs ?? Number.NaN).toFixed(3)} ms, planning ` +
        `${(main.facts.planningMs ?? Number.NaN).toFixed(3)} ms; buffers shared hit=${String(
          main.facts.sharedHit,
        )} read=${String(main.facts.sharedRead)}; sorts=${String(main.facts.sorts)}; ` +
        `indexes=${main.facts.indexNames}. Full staff-list path (page + tag + version ` +
        `loads) median ${totalMedian.toFixed(2)} ms.`,
      '',
    );
  }
  for (const result of results) {
    lines.push(`<details><summary>EXPLAIN (ANALYZE, BUFFERS) — ${result.statement.label}</summary>`, '');
    lines.push('```sql');
    lines.push(result.statement.sql.trim());
    if (result.statement.values.length > 0) {
      lines.push('-- parameters: ' + JSON.stringify(result.statement.values));
    }
    lines.push('```', '');
    lines.push('```');
    lines.push(result.plan.trimEnd());
    lines.push('```', '</details>', '');
  }
  return lines.join('\n');
}

/* ── main ────────────────────────────────────────────────────────────────── */

interface Args {
  readonly out: string | null;
  readonly repetitions: number;
}

function parseArgs(argv: readonly string[]): Args {
  let out: string | null = null;
  let repetitions = 15;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      out = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--repeat') {
      repetitions = Number(argv[i + 1] ?? '15');
      i += 1;
    }
  }
  return { out, repetitions };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const target = resolvePerfTarget(process.env, PERF_BENCH_OPT_IN);
  const client = new Client({ connectionString: target.url });
  await client.connect();

  try {
    const identity = await verifyPerfDatabase(client, target);
    console.log(`Benchmarking ${describePerfTarget(target)} (PostgreSQL ${String(identity.serverVersionNum)})`);

    // Statistics are the planner's input; a stale ANALYZE would be measuring
    // yesterday's data distribution. ANALYZE writes no table rows.
    await client.query('ANALYZE');

    const settings = await client.query<{ name: string; setting: string; unit: string | null }>(
      `SELECT name, setting, unit FROM pg_settings
        WHERE name IN ('server_version','shared_buffers','work_mem','maintenance_work_mem',
                      'effective_cache_size','random_page_cost','seq_page_cost','jit',
                      'default_statistics_target','max_parallel_workers_per_gather')
        ORDER BY name`,
    );
    const dbFacts = await client.query<{ datcollate: string; size: string; questions: string; versions: string }>(
      `SELECT datcollate,
              pg_size_pretty(pg_database_size(current_database())) AS size,
              (SELECT count(*) FROM questions) AS questions,
              (SELECT count(*) FROM question_versions) AS versions
         FROM pg_database WHERE datname = current_database()`,
    );
    const hasSearchColumn = (
      await client.query<{ present: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='question_versions'
                           AND column_name='search_text') AS present`,
      )
    ).rows[0]?.present === true;

    const indexes = await client.query<{ indexname: string; definition: string; size: string }>(
      `SELECT i.indexname,
              i.indexdef AS definition,
              pg_size_pretty(pg_relation_size(quote_ident(i.schemaname) || '.' ||
                                              quote_ident(i.indexname))) AS size
         FROM pg_indexes i
        WHERE i.schemaname = 'public'
          AND i.tablename IN ('questions','question_versions','question_options','answer_keys',
                              'question_sources','question_tags')
        ORDER BY i.tablename, pg_relation_size(quote_ident(i.schemaname) || '.' ||
                                               quote_ident(i.indexname)) DESC, i.indexname`,
    );

    const environment: Record<string, string> = {
      'PostgreSQL': settings.rows.find((r) => r.name === 'server_version')?.setting ?? '?',
      'Database': `${target.databaseName} @ ${target.host}:${String(target.port)} (disposable, loopback)`,
      'Database size': dbFacts.rows[0]?.size ?? '?',
      'Collation (lc_collate)': dbFacts.rows[0]?.datcollate ?? '?',
      'Rows': `questions=${dbFacts.rows[0]?.questions ?? '?'}, question_versions=${dbFacts.rows[0]?.versions ?? '?'}`,
      'Dataset': 'scripts/db/seed-perf.ts, fixed seed 0x04d2026 (50,000 questions, ~3 versions each)',
      'search_text column': hasSearchColumn ? 'present' : 'absent (migration 0003 not applied)',
    };
    for (const row of settings.rows) {
      if (row.name === 'server_version') continue;
      environment[row.name] = `${row.setting}${row.unit === null ? '' : ` ${row.unit}`}`;
    }

    const fixtures = await loadFixtures(client);
    const selected = cases().filter(
      (benchCase) => hasSearchColumn || benchCase.requiresSearchColumn !== true,
    );

    const sections: string[] = [];
    const summaryRows: string[] = [
      '| Case | Page query median | Full path median | EXPLAIN execution | Planning | Driving scan (estimated → actual rows) | Buffers (hit/read) | Sorts | Index used |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    const skipped = cases().length - selected.length;

    for (const benchCase of selected) {
      const spec = benchCase.spec(fixtures);
      const mainStatement = renderListQuery(spec).main;
      const main = await measureStatement(client, mainStatement, args.repetitions);

      // The relation loads use the ids the page query actually returned.
      const page = await client.query(mainStatement.sql, mainStatement.values);
      const pageIds = (page.rows as { id: string }[]).map((row) => row.id);
      const rendered = renderListQuery(spec, pageIds);
      const tags = await measureStatement(client, rendered.tags, args.repetitions);
      const versions = await measureStatement(client, rendered.versions, args.repetitions);

      // A third timing: the whole path as one client sees it.
      const totalSamples: number[] = [];
      for (let i = 0; i < args.repetitions; i += 1) {
        const started = process.hrtime.bigint();
        const rows = await client.query(rendered.main.sql, rendered.main.values);
        const ids = (rows.rows as { id: string }[]).map((row) => row.id);
        const tagLoad = renderTagStatement(ids);
        const versionLoad = renderVersionStatement(ids);
        await client.query(tagLoad.sql, tagLoad.values);
        await client.query(versionLoad.sql, versionLoad.values);
        totalSamples.push(Number(process.hrtime.bigint() - started) / 1_000_000);
      }

      const mainMedian = median(main.wallMs);
      const totalMedian = median(totalSamples);
      summaryRows.push(
        `| ${benchCase.title} | ${mainMedian.toFixed(2)} ms | ${totalMedian.toFixed(2)} ms | ` +
          `${(main.facts.executionMs ?? Number.NaN).toFixed(2)} ms | ` +
          `${(main.facts.planningMs ?? Number.NaN).toFixed(2)} ms | ` +
          `${main.facts.scans} ${main.facts.scanEstimated} → ${main.facts.scanActual} | ` +
          `${String(main.facts.sharedHit)}/${String(main.facts.sharedRead)} | ` +
          `${String(main.facts.sorts)} | ${main.facts.indexNames} |`,
      );
      const summary =
        `Driving scan: ${main.facts.scans}, estimated ${main.facts.scanEstimated} rows, ` +
        `actual ${main.facts.scanActual} rows.`;
      sections.push(caseSection(benchCase, [main, tags, versions], mainMedian, totalMedian, spec, summary));
      console.log(
        `  ${benchCase.id}: page ${mainMedian.toFixed(2)} ms, full path ${totalMedian.toFixed(2)} ms`,
      );
    }

    const title = hasSearchColumn
      ? 'Phase 04D — staff list: AFTER (migration 0003 + service changes)'
      : 'Phase 04D — staff list: BEFORE (baseline, no 04D indexes)';

    const body = [
      header(title, environment),
      '## Summary',
      '',
      summaryRows.join('\n'),
      '',
      skipped > 0
        ? `_${String(skipped)} search case(s) skipped: the \`search_text\` projection does not exist in this database, so the feature being measured does not exist yet._\n`
        : '',
      '## Index inventory at measurement time',
      '',
      'Sizes are `pg_relation_size` in this database, listed largest first within each table.',
      '',
      '```sql',
      ...indexes.rows.map((row) => `-- ${row.size}\n${row.indexname}: ${row.definition}`),
      '```',
      '',
      '## Cases',
      '',
      sections.join('\n'),
    ].join('\n');

    if (args.out === null) {
      process.stdout.write(body);
    } else {
      writeFileSync(args.out, `${body}\n`, 'utf8');
      console.log(`Wrote ${args.out}`);
    }
    return 0;
  } finally {
    await client.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
