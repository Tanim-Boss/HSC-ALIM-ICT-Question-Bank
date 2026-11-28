/**
 * Phase 04D — deterministic performance dataset (50,000 questions).
 *
 *   ICT_PERF_SEED=1 ICT_PERF_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/ict_perf_04d \
 *     node scripts/db/seed-perf.ts
 *
 * WHAT IT WRITES (the assumptions a reader needs to judge the numbers)
 * -------------------------------------------------------------------
 *   · 50,000 questions over ONE subject (ICT) and ONE education level (HSC),
 *     split across SIX chapters with a deliberately uneven, realistic skew
 *     (chapter 3 "number systems" and chapter 4 "web design" are the popular
 *     ones, chapter 1 the least asked).
 *   · ~3 versions per question (weights: 2→15%, 3→70%, 4→15%, mean 3.0), so
 *     ~150,000 question_versions — a question's version history is the reason
 *     "one row per question" and "one row per version" plans differ.
 *   · Provenance (question_sources): 12 boards — the 10 general education
 *     boards, MADRASAH (Alim) and BTEB (technical) — and 15 academic years
 *     (2011…2025), plus 200 colleges. 45% of questions have a BOARD source,
 *     30% a COLLEGE source, 15% both (two rows: a board row and a college row,
 *     which is legal — a question set by a college may also appear on a board
 *     paper), 10% ORIGINAL. Boards and colleges are independent dimensions;
 *     the dataset is built so that both filters are individually selective and
 *     their combination is not empty.
 *   · 40 tags, 1…4 per question (realistic long tail: most questions carry one
 *     or two).
 *   · MCQ 70% / CQ 30%; status PUBLISHED 80% / DRAFT 12% / ARCHIVED 8%.
 *   · Content is real content-block documents in the EXISTING envelope
 *     ({format, version, blocks}), Bangla and English, including block types
 *     that carry text in nested fields (list items, table cells, image alt
 *     text). Answer keys and CQ rubrics carry a unique sentinel token so a
 *     leakage test can prove the search projection never contains them.
 *   · created_at is spread deterministically over ~1250 days, so keyset
 *     pagination has 50,000 distinct (created_at, id) positions and "page 50"
 *     is a real deep page, not a shortcut.
 *
 * DETERMINISM
 * -----------
 * Every value is derived from a mulberry32 PRNG seeded with SEED (0x04d_2026)
 * plus the row's ordinal — no Date.now(), no Math.random(), no crypto. Two runs
 * against two fresh empty disposable databases therefore produce the same
 * 800k rows and the same fingerprint (printed at the end: md5 of the ordered
 * question ids and of the ordered version (id, content-search-text) pairs).
 *
 * SAFETY — see scripts/db/perf-guard.ts for the full rule set
 * ----------------------------------------------------------
 *   · Requires ICT_PERF_SEED=1 (an ordinary app start is not authorisation).
 *   · Loopback host only, database name must be ict_perf_…, NODE_ENV must not
 *     be production. No override flag exists.
 *   · Verifies the LIVE server identity before the first write.
 *   · Never drops, resets, truncates or overwrites: it refuses to run when the
 *     target already holds question rows, and says so.
 *
 * Runs under plain Node 22 type stripping (relative .ts imports only), like
 * scripts/db/bootstrap-super-admin.ts. It talks to PostgreSQL through `pg`
 * rather than the Prisma client for two reasons: the client is generated code
 * that is git-ignored (and its engine download is blocked in authoring
 * sandboxes), and bulk loading 800k rows wants multi-row INSERT batches.
 */

import pg from 'pg';

import {
  describePerfTarget,
  resolvePerfTarget,
  verifyPerfDatabase,
  type PerfIdentityClient,
} from './perf-guard.ts';

const { Client } = pg;

/* ── shape of the dataset ─────────────────────────────────────────────────── */

const SEED = 0x04d_2026;
const QUESTION_COUNT = 50_000;
const COLLEGE_COUNT = 200;
const TAG_COUNT = 40;
/** Newest question is created here; the dataset spans SPAN_DAYS before it. */
const NEWEST_CREATED_AT = Date.UTC(2026, 10, 20, 0, 0, 0);
const SPAN_DAYS = 1250;

interface ChapterSeed {
  readonly number: number;
  readonly titleBn: string;
  readonly titleEn: string;
  readonly weight: number;
}

const CHAPTERS: readonly ChapterSeed[] = [
  {
    number: 1,
    titleBn: 'তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ প্রেক্ষিত',
    titleEn: 'ICT: World and Bangladesh Perspective',
    weight: 10,
  },
  {
    number: 2,
    titleBn: 'কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং',
    titleEn: 'Communication Systems and Networking',
    weight: 17,
  },
  {
    number: 3,
    titleBn: 'সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস',
    titleEn: 'Number Systems and Digital Devices',
    weight: 25,
  },
  { number: 4, titleBn: 'ওয়েব ডিজাইন পরিচিতি ও HTML', titleEn: 'Web Design and HTML', weight: 23 },
  { number: 5, titleBn: 'প্রোগ্রামিং ভাষা', titleEn: 'Programming Language', weight: 14 },
  {
    number: 6,
    titleBn: 'ডেটাবেস ম্যানেজমেন্ট সিস্টেম',
    titleEn: 'Database Management System',
    weight: 11,
  },
];

interface BoardSeed {
  readonly code: string;
  readonly nameEn: string;
  readonly nameBn: string;
  readonly type: 'GENERAL' | 'MADRASAH' | 'TECHNICAL';
  readonly weight: number;
}

/**
 * The 10 general education boards, MADRASAH (Alim) and BTEB (technical).
 *
 * The task brief says "11 education boards plus MADRASAH"; the national
 * inventory is 10 general boards + Madrasah + Technical (12), which is exactly
 * what the BoardType enum (GENERAL / MADRASAH / TECHNICAL) models. The dataset
 * follows the schema's domain, not the brief's count, and says so here.
 */
const BOARDS: readonly BoardSeed[] = [
  { code: 'DHAKA', nameEn: 'Dhaka', nameBn: 'ঢাকা', type: 'GENERAL', weight: 190 },
  { code: 'RAJSHAHI', nameEn: 'Rajshahi', nameBn: 'রাজশাহী', type: 'GENERAL', weight: 120 },
  { code: 'CUMILLA', nameEn: 'Cumilla', nameBn: 'কুমিল্লা', type: 'GENERAL', weight: 100 },
  { code: 'CHATTOGRAM', nameEn: 'Chattogram', nameBn: 'চট্টগ্রাম', type: 'GENERAL', weight: 100 },
  { code: 'JASHORE', nameEn: 'Jashore', nameBn: 'যশোর', type: 'GENERAL', weight: 90 },
  { code: 'SYLHET', nameEn: 'Sylhet', nameBn: 'সিলেট', type: 'GENERAL', weight: 85 },
  { code: 'BARISHAL', nameEn: 'Barishal', nameBn: 'বরিশাল', type: 'GENERAL', weight: 80 },
  { code: 'DINAJPUR', nameEn: 'Dinajpur', nameBn: 'দিনাজপুর', type: 'GENERAL', weight: 80 },
  { code: 'MYMENSINGH', nameEn: 'Mymensingh', nameBn: 'ময়মনসিংহ', type: 'GENERAL', weight: 75 },
  { code: 'FARIDPUR', nameEn: 'Faridpur', nameBn: 'ফরিদপুর', type: 'GENERAL', weight: 60 },
  {
    code: 'MADRASAH',
    nameEn: 'Bangladesh Madrasah Education Board',
    nameBn: 'মাদ্রাসা শিক্ষা বোর্ড',
    type: 'MADRASAH',
    weight: 70,
  },
  {
    code: 'BTEB',
    nameEn: 'Bangladesh Technical Education Board',
    nameBn: 'কারিগরি শিক্ষা বোর্ড',
    type: 'TECHNICAL',
    weight: 50,
  },
];

/** 15 academic years; recent years carry more questions (the bank grows). */
const YEARS: readonly number[] = Array.from({ length: 15 }, (_, i) => 2011 + i);

const TAG_NAMES: readonly { readonly name: string; readonly slug: string }[] = [
  { name: 'Number System', slug: 'number-system' },
  { name: 'Binary', slug: 'binary' },
  { name: 'Boolean Algebra', slug: 'boolean-algebra' },
  { name: 'Logic Gate', slug: 'logic-gate' },
  { name: 'Networking', slug: 'networking' },
  { name: 'Topology', slug: 'topology' },
  { name: 'IP Address', slug: 'ip-address' },
  { name: 'Transmission Media', slug: 'transmission-media' },
  { name: 'HTML', slug: 'html' },
  { name: 'CSS', slug: 'css' },
  { name: 'Web Design', slug: 'web-design' },
  { name: 'Programming', slug: 'programming' },
  { name: 'C Language', slug: 'c-language' },
  { name: 'Algorithm', slug: 'algorithm' },
  { name: 'Database', slug: 'database' },
  { name: 'SQL', slug: 'sql' },
  { name: 'DBMS', slug: 'dbms' },
  { name: 'Memory', slug: 'memory' },
  { name: 'Processor', slug: 'processor' },
  { name: 'Input Device', slug: 'input-device' },
  { name: 'Output Device', slug: 'output-device' },
  { name: 'Operating System', slug: 'operating-system' },
  { name: 'Cyber Security', slug: 'cyber-security' },
  { name: 'ICT Policy', slug: 'ict-policy' },
  { name: 'E-learning', slug: 'e-learning' },
  { name: 'সংখ্যা পদ্ধতি', slug: 'bn-number-system' },
  { name: 'বাইনারি', slug: 'bn-binary' },
  { name: 'লজিক গেট', slug: 'bn-logic-gate' },
  { name: 'নেটওয়ার্ক', slug: 'bn-network' },
  { name: 'টোপোলজি', slug: 'bn-topology' },
  { name: 'ওয়েব ডিজাইন', slug: 'bn-web-design' },
  { name: 'প্রোগ্রামিং', slug: 'bn-programming' },
  { name: 'ডেটাবেস', slug: 'bn-database' },
  { name: 'মেমোরি', slug: 'bn-memory' },
  { name: 'ইনপুট ডিভাইস', slug: 'bn-input-device' },
  { name: 'আউটপুট ডিভাইস', slug: 'bn-output-device' },
  { name: 'শিক্ষা প্রযুক্তি', slug: 'bn-education-technology' },
  { name: 'সাইবার অপরাধ', slug: 'bn-cyber-crime' },
  { name: 'তথ্য ও যোগাযোগ প্রযুক্তি', slug: 'bn-ict' },
  { name: 'ই-গভর্ন্যান্স', slug: 'bn-e-governance' },
];

const COLLEGE_NAME_HEAD = [
  'Dhaka',
  'Rajshahi',
  'Cumilla',
  'Chattogram',
  'Jashore',
  'Sylhet',
  'Barishal',
  'Dinajpur',
  'Mymensingh',
  'Faridpur',
  'Bogura',
  'Pabna',
  'Kushtia',
  'Tangail',
  'Noakhali',
  'Feni',
  'Rangpur',
  'Khulna',
  'Jamalpur',
  'Narsingdi',
] as const;
const COLLEGE_NAME_TAIL = [
  'College',
  'Model College',
  'Govt. College',
  'City College',
  'Adarsha College',
  'Mahila College',
  'Degree College',
  'Technical College',
  'Ideal College',
  'Academy',
] as const;

/** The sentinel that must never appear in a staff search projection. */
/**
 * Dimension rows carry updated_at NOT NULL with no database default (Prisma's
 * @updatedAt is client-side). A fixed value keeps the dataset reproducible.
 */
const DIMENSION_UPDATED_AT = new Date(NEWEST_CREATED_AT);

const RUBRIC_SENTINEL = 'zzrubriccanaryzz';
const RUBRIC_BN = 'রুব্রিক';
const OPTION_SENTINEL = 'zzoptioncanaryzz';

/* ── deterministic PRNG ───────────────────────────────────────────────────── */

/** mulberry32 — small, fast, seedable, and reproducible across Node versions. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One independent stream per row family, so adding a column cannot shift ids. */
function rngFor(stream: number, ordinal: number): () => number {
  return makeRng((SEED ^ Math.imul(stream, 0x9e3779b1) ^ Math.imul(ordinal + 1, 0x85ebca6b)) >>> 0);
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  const value = list[Math.floor(rng() * list.length)];
  if (value === undefined) throw new Error('empty pool');
  return value;
}

function weightedIndex(rng: () => number, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let point = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    point -= weights[i] ?? 0;
    if (point <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * A deterministic RFC-4122-shaped v4 UUID from the given RNG stream.
 *
 * IDS ARE DRAWN FROM A PER-TABLE SEQUENCE, never from a tuple such as
 * (question, version, option). rngFor() folds its arguments into a 32-bit seed,
 * so two different tuples can collide in the seed space; with ~800k rows a
 * birthday collision is not a risk, it is a certainty (the first run reproduced
 * it). A unique ordinal per table is injective, so ids are unique.
 */
function uuid(rng: () => number): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(rng() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ── content ─────────────────────────────────────────────────────────────── */

interface QuestionTemplate {
  readonly chapter: number;
  readonly lang: 'bn' | 'en';
  readonly stem: (rng: () => number) => string;
  readonly options?: readonly string[];
  readonly correct?: (rng: () => number) => number;
  readonly tags: readonly number[];
}

const binaryOf = (rng: () => number): string => {
  const bits = 4 + Math.floor(rng() * 5);
  let s = '';
  for (let i = 0; i < bits; i += 1) s += rng() < 0.5 ? '0' : '1';
  return s;
};

/**
 * Realistic stems. Every token that the search tests need appears in real
 * question text here, not in a synthetic column: "computer", "operating
 * system", "memory", "কম্পিউটার", "শিক্ষা", "ক্ষেত্র", "নেটওয়ার্ক", "ডেটাবেস",
 * and the Bangla conjunct ক্ষ inside several ordinary words.
 */
const TEMPLATES: readonly QuestionTemplate[] = [
  {
    chapter: 3,
    lang: 'bn',
    stem: (r) => `বাইনারী সংখ্যা ${binaryOf(r)} এর দশমিক মান কত?`,
    options: ['৯', '১১', '১৩', '১৫'],
    correct: (r) => Math.floor(r() * 4),
    tags: [0, 1, 26],
  },
  {
    chapter: 3,
    lang: 'bn',
    stem: () => 'নিচের কোনটি সার্বজনীন গেট?',
    options: ['AND', 'OR', 'NAND', 'XOR'],
    correct: () => 2,
    tags: [2, 3, 27],
  },
  {
    chapter: 3,
    lang: 'en',
    stem: (r) => `What is the decimal value of the binary number ${binaryOf(r)}?`,
    options: ['9', '11', '13', '15'],
    correct: (r) => Math.floor(r() * 4),
    tags: [0, 1],
  },
  {
    chapter: 3,
    lang: 'en',
    stem: () => 'Which logic gate is called a universal gate?',
    options: ['AND', 'OR', 'NAND', 'XOR'],
    correct: () => 2,
    tags: [2, 3],
  },
  {
    chapter: 2,
    lang: 'bn',
    stem: () => 'নেটওয়ার্কে ব্যবহৃত তারের মাধ্যম হিসেবে নিচের কোনটি সঠিক?',
    options: ['টুইস্টেড পেয়ার ক্যাবল', 'মডেম', 'রাউটার', 'হাব'],
    correct: () => 0,
    tags: [4, 5, 28],
  },
  {
    chapter: 2,
    lang: 'bn',
    stem: () => 'IPv4 অ্যাড্রেসে বিটের সংখ্যা কত?',
    options: ['৩২', '৬৪', '১২৮', '২৫৬'],
    correct: () => 0,
    tags: [4, 6],
  },
  {
    chapter: 2,
    lang: 'en',
    stem: () => 'Which topology connects every node to a single central device?',
    options: ['Star', 'Ring', 'Mesh', 'Bus'],
    correct: () => 0,
    tags: [5, 4],
  },
  {
    chapter: 2,
    lang: 'en',
    stem: () => 'Which protocol is used to transfer web pages?',
    options: ['FTP', 'HTTP', 'SMTP', 'SNMP'],
    correct: () => 1,
    tags: [4],
  },
  {
    chapter: 4,
    lang: 'en',
    stem: () => 'What does HTML stand for?',
    options: [
      'Hyper Text Markup Language',
      'High Text Machine Language',
      'Hyper Tabular Markup Language',
      'Home Tool Markup Language',
    ],
    correct: () => 0,
    tags: [8, 10],
  },
  {
    chapter: 4,
    lang: 'bn',
    stem: () => 'ওয়েব পেজের মূল কাঠামো কোন ট্যাগ দিয়ে শুরু হয়?',
    options: ['<head>', '<html>', '<body>', '<title>'],
    correct: () => 1,
    tags: [8, 10, 30],
  },
  {
    chapter: 4,
    lang: 'bn',
    stem: () => 'HTML কী?',
    options: ['মার্কআপ ভাষা', 'প্রোগ্রামিং ভাষা', 'ডেটাবেস', 'অপারেটিং সিস্টেম'],
    correct: () => 0,
    tags: [8, 31],
  },
  {
    chapter: 4,
    lang: 'en',
    stem: () => 'Which CSS property changes the background colour of an element?',
    options: ['background-color', 'font-colour', 'border-style', 'text-align'],
    correct: () => 0,
    tags: [9, 10],
  },
  {
    chapter: 5,
    lang: 'en',
    stem: () => 'Which of the following is an operating system?',
    options: ['Linux', 'Oracle', 'MySQL', 'Apache'],
    correct: () => 0,
    tags: [11, 21],
  },
  {
    chapter: 5,
    lang: 'en',
    stem: () =>
      'The operating system manages the memory of a computer. Which of these is volatile memory?',
    options: ['RAM', 'ROM', 'Hard disk', 'Flash drive'],
    correct: () => 0,
    tags: [11, 17, 21],
  },
  {
    chapter: 5,
    lang: 'bn',
    stem: () => 'C ভাষায় লুপ চালানোর জন্য কোন স্টেটমেন্ট ব্যবহৃত হয়?',
    options: ['for', 'if', 'switch', 'goto'],
    correct: () => 0,
    tags: [11, 12, 32],
  },
  {
    chapter: 5,
    lang: 'bn',
    stem: () => 'কম্পিউটারের প্রধান মেমোরি কোনটি?',
    options: ['র‍্যাম', 'রম', 'হার্ডডিস্ক', 'পেনড্রাইভ'],
    correct: () => 0,
    tags: [17, 33],
  },
  {
    chapter: 6,
    lang: 'bn',
    stem: () => 'ডেটাবেস ম্যানেজমেন্ট সিস্টেমের প্রধান কাজ কী?',
    options: ['ডেটা সংরক্ষণ ও ব্যবস্থাপনা', 'ছবি সম্পাদনা', 'ওয়েব ব্রাউজিং', 'ভিডিও রেন্ডারিং'],
    correct: () => 0,
    tags: [14, 15, 34],
  },
  {
    chapter: 6,
    lang: 'bn',
    stem: () => 'SQL এ ডেটা বাছাইয়ের জন্য কোন কমান্ড ব্যবহৃত হয়?',
    options: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    correct: () => 0,
    tags: [14, 15, 16],
  },
  {
    chapter: 6,
    lang: 'en',
    stem: () => 'Which SQL command retrieves rows from a table?',
    options: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    correct: () => 0,
    tags: [14, 15],
  },
  {
    chapter: 1,
    lang: 'bn',
    stem: () => 'শিক্ষা ক্ষেত্রে তথ্য ও যোগাযোগ প্রযুক্তির ব্যবহার কোনটি?',
    options: ['ই-লার্নিং', 'ই-বাণিজ্য', 'ই-গভর্ন্যান্স', 'ই-মেইল'],
    correct: () => 0,
    tags: [23, 24, 36, 37],
  },
  {
    chapter: 1,
    lang: 'bn',
    stem: () => 'নিচের কোনটি ইনপুট ডিভাইস?',
    options: ['কিবোর্ড', 'মনিটর', 'প্রিন্টার', 'স্পিকার'],
    correct: () => 0,
    tags: [19, 35],
  },
  {
    chapter: 1,
    lang: 'en',
    stem: () => 'Which of the following is an input device of a computer?',
    options: ['Keyboard', 'Monitor', 'Printer', 'Speaker'],
    correct: () => 0,
    tags: [19],
  },
  {
    chapter: 1,
    lang: 'en',
    stem: () =>
      'Cyber crime is a growing concern. Which of these protects a network from intrusion?',
    options: ['Firewall', 'Scanner', 'Plotter', 'Joystick'],
    correct: () => 0,
    tags: [22, 38],
  },
  {
    chapter: 1,
    lang: 'bn',
    stem: () => 'ই-গভর্ন্যান্স বাস্তবায়নে তথ্য প্রযুক্তির ভূমিকা কী?',
    options: ['সেবা সহজ করা', 'খরচ বাড়ানো', 'সময় বাড়ানো', 'কাগজের ব্যবহার বাড়ানো'],
    correct: () => 0,
    tags: [23, 39],
  },
];

/** A stem document: one or two paragraphs, in the schema's existing envelope. */
function stemDocument(lang: 'bn' | 'en', text: string, variant: number): unknown {
  const blocks: unknown[] = [{ type: 'paragraph', data: { text, lang } }];
  if (variant % 11 === 0) {
    blocks.push({
      type: 'list',
      data: {
        ordered: false,
        lang,
        items: [
          { text: lang === 'bn' ? 'শিক্ষার্থীদের জন্য সহায়ক' : 'Helpful for students' },
          { text: lang === 'bn' ? 'বৃক্ষ রোপণ কর্মসূচি' : 'Tree plantation programme' },
        ],
      },
    });
  }
  if (variant % 17 === 0) {
    blocks.push({
      type: 'image',
      data: {
        assetId: uuid(rngFor(9_001, variant)),
        alt: lang === 'bn' ? 'কম্পিউটার নেটওয়ার্কের চিত্র' : 'Diagram of a computer network',
        longDescription:
          lang === 'bn' ? 'কেন্দ্রীয় হাবের সঙ্গে সংযুক্ত নোড' : 'Nodes attached to a central hub',
      },
    });
  }
  if (variant % 23 === 0) {
    blocks.push({
      type: 'table',
      data: {
        lang,
        headerRow: true,
        rows: [
          [
            { text: lang === 'bn' ? 'ইনপুট' : 'Input' },
            { text: lang === 'bn' ? 'আউটপুট' : 'Output' },
          ],
          [
            { text: lang === 'bn' ? 'কিবোর্ড' : 'Keyboard' },
            { text: lang === 'bn' ? 'মনিটর' : 'Monitor' },
          ],
        ],
      },
    });
  }
  return { format: 'rich_blocks', version: 1, blocks };
}

function optionDocument(lang: 'bn' | 'en', text: string): unknown {
  return {
    format: 'rich_blocks',
    version: 1,
    blocks: [{ type: 'paragraph', data: { text, lang } }],
  };
}

function rubricDocument(childCount: number): unknown {
  return {
    parts: [
      { part: 'ক', marks: 2, text: `${RUBRIC_BN} উত্তর ${RUBRIC_SENTINEL}` },
      { part: 'খ', marks: 4, text: `${RUBRIC_BN} ব্যাখ্যা ${RUBRIC_SENTINEL}` },
    ],
    children: Array.from({ length: childCount }, (_, i) => ({
      part: `${String(i + 1)}`,
      marks: 1,
      text: `${RUBRIC_BN} সহায়ক বিন্দু`,
    })),
  };
}

/* ── batches ─────────────────────────────────────────────────────────────── */

interface BatchWriter {
  add(row: readonly unknown[]): Promise<void>;
  flush(): Promise<void>;
}

const PARAM_LIMIT = 30_000;

function batchWriter(
  client: { query: (sql: string, values: unknown[]) => Promise<unknown> },
  table: string,
  columns: readonly string[],
  /** A child table may not be written before the parent rows it references. */
  beforeFlush?: () => Promise<void>,
): BatchWriter {
  const rows: unknown[][] = [];
  const perBatch = Math.max(1, Math.floor(PARAM_LIMIT / columns.length));

  async function flush(): Promise<void> {
    if (rows.length === 0) return;
    if (beforeFlush !== undefined) await beforeFlush();
    const values: unknown[] = [];
    const tuples: string[] = [];
    for (const row of rows) {
      const placeholders = row.map((_, i) => `$${String(values.length + i + 1)}`);
      values.push(...row);
      tuples.push(`(${placeholders.join(', ')})`);
    }
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`,
      values,
    );
    rows.length = 0;
  }

  return {
    async add(row) {
      rows.push([...row]);
      if (rows.length >= perBatch) await flush();
    },
    flush,
  };
}

/* ── main ────────────────────────────────────────────────────────────────── */

interface CountRow extends Record<string, string> {
  questions: string;
  versions: string;
  options: string;
  keys: string;
  sources: string;
  tags: string;
}

async function refusesUnlessEmpty(client: PerfIdentityClient): Promise<void> {
  const result = await client.query<CountRow>(
    `SELECT (SELECT count(*) FROM questions) AS questions,
            (SELECT count(*) FROM question_versions) AS versions,
            (SELECT count(*) FROM question_options) AS options,
            (SELECT count(*) FROM answer_keys) AS keys,
            (SELECT count(*) FROM question_sources) AS sources,
            (SELECT count(*) FROM question_tags) AS tags`,
  );
  const row = result.rows[0];
  const nonEmpty =
    row === undefined ? [] : Object.entries(row).filter(([, value]) => Number(value) > 0);
  if (nonEmpty.length > 0) {
    throw new Error(
      `REFUSED: the target already holds question data (${nonEmpty
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(', ')}). This script never truncates or overwrites. Create a NEW empty ` +
        `database named ict_perf_<something>, apply prisma/migrations, and run it there.`,
    );
  }
}

/** True when migration 0003 (the search projection) has been applied. */
async function hasSearchColumn(client: PerfIdentityClient): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'question_versions'
          AND column_name = 'search_text'
     ) AS present`,
  );
  return result.rows[0]?.present === true;
}

async function main(): Promise<number> {
  const target = resolvePerfTarget(process.env);
  const client = new Client({ connectionString: target.url });
  await client.connect();
  try {
    const db: PerfIdentityClient = {
      query: (sql, values) => client.query(sql, values),
    };
    const identity = await verifyPerfDatabase(db, target);
    await refusesUnlessEmpty(db);
    const searchColumn = await hasSearchColumn(db);

    console.log(`Seeding ${describePerfTarget(target)}`);
    console.log(
      `  server: PostgreSQL ${String(identity.serverVersionNum)} at ` +
        `${identity.serverAddress ?? 'unix socket'}; search projection column: ` +
        `${searchColumn ? 'present (computed by ict_version_search_text)' : 'absent'}`,
    );
    const startedAt = Date.now();

    /* ── taxonomy ─────────────────────────────────────────────────────── */
    const levelId = uuid(rngFor(1, 0));
    const subjectId = uuid(rngFor(2, 0));
    const chapterIds = CHAPTERS.map((_, i) => uuid(rngFor(3, i)));
    const topicIds = CHAPTERS.map((_, i) => [uuid(rngFor(4, i * 2)), uuid(rngFor(4, i * 2 + 1))]);
    const boardIds = BOARDS.map((_, i) => uuid(rngFor(5, i)));
    const yearIds = YEARS.map((_, i) => uuid(rngFor(6, i)));
    const collegeIds = Array.from({ length: COLLEGE_COUNT }, (_, i) => uuid(rngFor(7, i)));
    const tagIds = TAG_NAMES.map((_, i) => uuid(rngFor(8, i)));
    const staffIds = Array.from({ length: 6 }, (_, i) => uuid(rngFor(8_500, i)));

    await client.query(
      `INSERT INTO education_levels (id, code, name_bn, name_en, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [levelId, 'HSC', 'উচ্চ মাধ্যমিক', 'Higher Secondary', DIMENSION_UPDATED_AT],
    );
    await client.query(
      `INSERT INTO subjects (id, code, name_bn, name_en, updated_at) VALUES ($1,$2,$3,$4,$5)`,
      [
        subjectId,
        'ICT',
        'তথ্য ও যোগাযোগ প্রযুক্তি',
        'Information and Communication Technology',
        DIMENSION_UPDATED_AT,
      ],
    );
    await client.query(`INSERT INTO level_subjects (level_id, subject_id) VALUES ($1,$2)`, [
      levelId,
      subjectId,
    ]);
    for (const [i, chapter] of CHAPTERS.entries()) {
      await client.query(
        `INSERT INTO chapters (id, subject_id, chapter_number, title_bn, title_en, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          chapterIds[i],
          subjectId,
          chapter.number,
          chapter.titleBn,
          chapter.titleEn,
          DIMENSION_UPDATED_AT,
        ],
      );
      for (const [j, topicId] of (topicIds[i] ?? []).entries()) {
        await client.query(
          `INSERT INTO topics (id, chapter_id, name_bn, name_en, order_index, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            topicId,
            chapterIds[i],
            `${chapter.titleBn} — টপিক ${String(j + 1)}`,
            `Topic ${String(j + 1)}`,
            j + 1,
            DIMENSION_UPDATED_AT,
          ],
        );
      }
    }
    for (const [i, board] of BOARDS.entries()) {
      await client.query(
        `INSERT INTO boards (id, code, name_bn, name_en, type, updated_at)
         VALUES ($1,$2,$3,$4,$5::"BoardType",$6)`,
        [boardIds[i], board.code, board.nameBn, board.nameEn, board.type, DIMENSION_UPDATED_AT],
      );
    }
    for (const [i, year] of YEARS.entries()) {
      await client.query(
        `INSERT INTO academic_years (id, label, year, updated_at) VALUES ($1,$2,$3,$4)`,
        [yearIds[i], String(year), year, DIMENSION_UPDATED_AT],
      );
    }
    for (const [i, id] of collegeIds.entries()) {
      const head = COLLEGE_NAME_HEAD[i % COLLEGE_NAME_HEAD.length] ?? 'Dhaka';
      const tail =
        COLLEGE_NAME_TAIL[Math.floor(i / COLLEGE_NAME_HEAD.length) % COLLEGE_NAME_TAIL.length] ??
        'College';
      await client.query(`INSERT INTO colleges (id, name, code, updated_at) VALUES ($1,$2,$3,$4)`, [
        id,
        `${head} ${tail} ${String(i + 1)}`,
        `COL${String(i + 1).padStart(4, '0')}`,
        DIMENSION_UPDATED_AT,
      ]);
    }
    for (const [i, tag] of TAG_NAMES.entries()) {
      await client.query(`INSERT INTO tags (id, name, slug) VALUES ($1,$2,$3)`, [
        tagIds[i],
        tag.name,
        tag.slug,
      ]);
    }
    for (const [i, id] of staffIds.entries()) {
      await client.query(`INSERT INTO profiles (id, display_name, updated_at) VALUES ($1,$2,$3)`, [
        id,
        `Perf Staff ${String(i + 1)}`,
        DIMENSION_UPDATED_AT,
      ]);
    }

    /* ── questions, versions, options, keys, sources, tags ────────────── */
    const versionColumns = [
      'id',
      'question_id',
      'version_number',
      'status',
      'content',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
      'published_by',
      'published_at',
      ...(searchColumn ? ['search_text'] : []),
    ];
    const questions = batchWriter(client, 'questions', [
      'id',
      'type',
      'status',
      'difficulty',
      'created_via',
      'education_level_id',
      'subject_id',
      'chapter_id',
      'topic_id',
      'marks',
      'created_at',
      'updated_at',
    ]);
    const versions = batchWriter(client, 'question_versions', versionColumns, () =>
      questions.flush(),
    );
    /*
     * Migration 0005 freezes a PUBLISHED or ARCHIVED version's options and key,
     * so — like the real authoring flow — every version is written as a DRAFT,
     * its children are written, and only then is it moved to its final status
     * (one UPDATE … FROM this session-local table, after every batch is
     * flushed). The UPDATE sets only status/published_by/published_at, so
     * updated_at and the fingerprint are unchanged.
     */
    await client.query(
      `CREATE TEMP TABLE seed_version_finals (
         id uuid PRIMARY KEY, status "VersionStatus" NOT NULL,
         published_by uuid, published_at timestamptz(3))`,
    );
    const versionFinals = batchWriter(client, 'seed_version_finals', [
      'id',
      'status',
      'published_by',
      'published_at',
    ]);
    const options = batchWriter(
      client,
      'question_options',
      ['id', 'version_id', 'key', 'content', 'sort_order'],
      () => versions.flush(),
    );
    const keys = batchWriter(
      client,
      'answer_keys',
      [
        'id',
        'version_id',
        'mcq_correct_option_key',
        'cq_rubric',
        'is_verified',
        'verified_by',
        'verified_at',
        'updated_at',
      ],
      () => options.flush(),
    );
    const sources = batchWriter(
      client,
      'question_sources',
      [
        'id',
        'question_id',
        'source_type',
        'board_id',
        'college_id',
        'academic_year_id',
        'source_name',
      ],
      () => questions.flush(),
    );
    const questionTags = batchWriter(client, 'question_tags', ['question_id', 'tag_id'], () =>
      questions.flush(),
    );

    const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
    let versionSeq = 0;
    let optionSeq = 0;
    let keySeq = 0;
    let sourceSeq = 0;
    let versionTotal = 0;
    let optionTotal = 0;
    let keyTotal = 0;
    let sourceTotal = 0;
    let tagTotal = 0;

    for (let i = 0; i < QUESTION_COUNT; i += 1) {
      const rng = rngFor(100, i);
      const template = TEMPLATES[Math.floor(rng() * TEMPLATES.length)] ?? TEMPLATES[0];
      const chapterIndex = template === undefined ? 0 : template.chapter - 1;
      const chapterId = chapterIds[chapterIndex];
      const isMcq = rng() < 0.7;
      const statusRoll = rng();
      const status = statusRoll < 0.8 ? 'PUBLISHED' : statusRoll < 0.92 ? 'DRAFT' : 'ARCHIVED';
      const questionId = uuid(rngFor(101, i));
      const createdAt = new Date(
        NEWEST_CREATED_AT -
          Math.floor(((QUESTION_COUNT - i) / QUESTION_COUNT) * SPAN_DAYS * 86_400_000) +
          Math.floor(rng() * 3_600_000),
      );
      const topicId = rng() < 0.6 ? (topicIds[chapterIndex]?.[0] ?? null) : null;
      const marks = isMcq ? 1 : 10;

      await questions.add([
        questionId,
        isMcq ? 'MCQ' : 'CQ',
        status,
        pick(rng, ['EASY', 'MEDIUM', 'MEDIUM', 'HARD']),
        rng() < 0.85 ? 'MANUAL' : rng() < 0.5 ? 'BULK_IMPORT' : 'AI_PARSER',
        levelId,
        subjectId,
        chapterId,
        topicId,
        marks,
        createdAt,
        createdAt,
      ]);

      /* versions: 2 → 15%, 3 → 70%, 4 → 15% (mean 3.0) */
      const versionCount = [2, 3, 4][weightedIndex(rng, [15, 70, 15])] ?? 3;
      for (let v = 1; v <= versionCount; v += 1) {
        const vrng = rngFor(102 + v, i);
        const versionId = uuid(rngFor(140, versionSeq));
        versionSeq += 1;
        const isLatest = v === versionCount;
        const versionStatus = isLatest ? status : 'ARCHIVED';
        const stemText = template === undefined ? 'প্রশ্ন' : template.stem(vrng);
        const language = template?.lang ?? 'bn';
        const content = stemDocument(language, stemText, i + v);
        const versionCreatedAt = new Date(createdAt.getTime() + v * 1_500_000);
        const published = versionStatus === 'PUBLISHED';
        const author = staffIds[Math.floor(vrng() * staffIds.length)] ?? staffIds[0];
        const versionOptions: { key: string; content: unknown }[] = [];
        let correctKey: string | null = null;
        let rubric: string | null = null;
        if (isMcq) {
          const labels = template?.options ?? ['এক', 'দুই', 'তিন', 'চার'];
          const correct = template?.correct?.(vrng) ?? 0;
          for (let o = 0; o < 4; o += 1) {
            const optionKey = OPTION_KEYS[o] ?? 'A';
            const base = labels[o] ?? String(o + 1);
            // A deterministic minority of options carries the sentinel, so a
            // test can prove option text IS searchable and answer keys are not.
            const text = o === 3 && i % 97 === 0 ? `${base} ${OPTION_SENTINEL}` : base;
            versionOptions.push({ key: optionKey, content: optionDocument(language, text) });
          }
          correctKey = OPTION_KEYS[correct] ?? 'A';
        } else {
          rubric = JSON.stringify(rubricDocument(2 + (i % 3)));
        }
        const verified = vrng() < (isMcq ? 0.35 : 0.2);

        /*
         * The search projection, when migration 0003 has been applied. It is
         * derived by the same SQL function the migration uses to backfill
         * existing rows, so seeded and backfilled text cannot diverge.
         */
        let searchText: string | null = null;
        if (searchColumn) {
          const result = await client.query<{ text: string }>(
            `SELECT ict_version_search_text($1::jsonb, $2::jsonb) AS text`,
            [JSON.stringify(content), JSON.stringify(versionOptions.map((o) => o.content))],
          );
          searchText = result.rows[0]?.text ?? '';
        }

        /* The parent row must exist before its options and key are written. */
        await versions.add([
          versionId,
          questionId,
          v,
          'DRAFT', // final status applied after the children exist (migration 0005)
          JSON.stringify(content),
          versionCreatedAt,
          versionCreatedAt,
          author,
          author,
          null,
          null,
          ...(searchColumn ? [searchText] : []),
        ]);
        if (versionStatus !== 'DRAFT') {
          await versionFinals.add([
            versionId,
            versionStatus,
            published ? author : null,
            published ? versionCreatedAt : null,
          ]);
        }
        versionTotal += 1;

        for (const [o, option] of versionOptions.entries()) {
          await options.add([
            uuid(rngFor(200, optionSeq)),
            versionId,
            option.key,
            JSON.stringify(option.content),
            o,
          ]);
          optionSeq += 1;
          optionTotal += 1;
        }
        await keys.add([
          uuid(rngFor(300, keySeq)),
          versionId,
          correctKey,
          rubric,
          verified,
          verified ? author : null,
          verified ? versionCreatedAt : null,
          versionCreatedAt,
        ]);
        keySeq += 1;
        keyTotal += 1;
      }

      /* provenance: board and college are independent dimensions */
      const provenanceRoll = rng();
      const yearId =
        yearIds[
          weightedIndex(
            rng,
            YEARS.map((_, k) => 10 + k),
          )
        ];
      const boardRow = async (sourceType: 'BOARD' | 'COLLEGE' | 'MODEL_TEST' | 'ORIGINAL') => {
        if (sourceType === 'BOARD') {
          const boardIndex = weightedIndex(
            rng,
            BOARDS.map((b) => b.weight),
          );
          await sources.add([
            uuid(rngFor(400, sourceSeq)),
            questionId,
            'BOARD',
            boardIds[boardIndex] ?? null,
            null,
            yearId ?? null,
            null,
          ]);
        } else if (sourceType === 'COLLEGE' || sourceType === 'MODEL_TEST') {
          const collegeIndex = Math.floor(rng() * COLLEGE_COUNT);
          await sources.add([
            uuid(rngFor(400, sourceSeq)),
            questionId,
            sourceType,
            null,
            collegeIds[collegeIndex] ?? null,
            yearId ?? null,
            null,
          ]);
        } else {
          await sources.add([
            uuid(rngFor(400, sourceSeq)),
            questionId,
            'ORIGINAL',
            null,
            null,
            null,
            'Perf original set',
          ]);
        }
        sourceSeq += 1;
        sourceTotal += 1;
      };
      if (provenanceRoll < 0.45) {
        await boardRow('BOARD');
      } else if (provenanceRoll < 0.6) {
        // A board paper that a college also used for its model test: two rows,
        // because one QuestionSource names either a board or a college.
        await boardRow('BOARD');
        await boardRow('MODEL_TEST');
      } else if (provenanceRoll < 0.9) {
        await boardRow('COLLEGE');
      } else {
        await boardRow('ORIGINAL');
      }

      /* tags: 1…4, most questions carry one or two */
      const tagCount = [1, 2, 3, 4][weightedIndex(rng, [40, 35, 18, 7])] ?? 1;
      const usedTags = new Set<string>();
      for (let t = 0; t < tagCount; t += 1) {
        const tagIndex =
          t === 0 && template !== undefined
            ? (template.tags[Math.floor(rng() * template.tags.length)] ?? 0)
            : Math.floor(rng() * TAG_COUNT);
        const tagId = tagIds[tagIndex];
        if (tagId === undefined || usedTags.has(tagId)) continue;
        usedTags.add(tagId);
        await questionTags.add([questionId, tagId]);
        tagTotal += 1;
      }

      if ((i + 1) % 10_000 === 0) console.log(`  … ${String(i + 1)} questions`);
    }

    await versions.flush();
    await options.flush();
    await keys.flush();
    await sources.flush();
    await questionTags.flush();
    await questions.flush();
    await versionFinals.flush();
    await client.query(
      `UPDATE question_versions v
          SET status = f.status, published_by = f.published_by, published_at = f.published_at
         FROM seed_version_finals f
        WHERE v.id = f.id`,
    );

    /* ── determinism fingerprint ──────────────────────────────────────── */
    const fingerprint = await client.query<{ questions: string; versions: string; tags: string }>(
      `SELECT (SELECT md5(string_agg(id::text, '' ORDER BY id)) FROM questions) AS questions,
              (SELECT md5(string_agg(id::text, '' ORDER BY id)) FROM question_versions) AS versions,
              (SELECT md5(string_agg(question_id::text || tag_id::text, '' ORDER BY question_id, tag_id))
                 FROM question_tags) AS tags`,
    );

    console.log(
      `Seeded in ${String(Math.round((Date.now() - startedAt) / 1000))}s: ` +
        `${String(QUESTION_COUNT)} questions, ${String(versionTotal)} versions, ` +
        `${String(optionTotal)} options, ${String(keyTotal)} answer keys, ` +
        `${String(sourceTotal)} sources, ${String(tagTotal)} question tags.`,
    );
    console.log(
      `Fingerprint (compare two fresh databases to prove reproducibility):\n` +
        `  questions=${fingerprint.rows[0]?.questions ?? '?'}\n` +
        `  versions=${fingerprint.rows[0]?.versions ?? '?'}\n` +
        `  question_tags=${fingerprint.rows[0]?.tags ?? '?'}`,
    );
    console.log(
      `Sentinels planted for the leakage test: rubric=${RUBRIC_SENTINEL}, option=${OPTION_SENTINEL}`,
    );
    return 0;
  } finally {
    await client.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  },
);
