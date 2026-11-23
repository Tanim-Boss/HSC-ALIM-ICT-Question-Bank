# HSC / ALIM ICT Question Bank & Online Examination Platform

> **Build Guide & Architecture Blueprint**
>
> A complete educational assessment platform — not just a question bank website.
> This README is the single source of truth for how to build the system later.
> Read it before writing any application code.

![Status](https://img.shields.io/badge/status-Planning%20%2F%20Architecture%20Phase-orange)
![Stack](https://img.shields.io/badge/stack-Next.js%20%2B%20TypeScript%20%2B%20PostgreSQL-blue)
![Architecture](https://img.shields.io/badge/architecture-Modular%20Monolith-green)

---

## Table of Contents

- [1. Project Vision](#1-project-vision)
- [2. The One Decision That Shapes Everything](#2-the-one-decision-that-shapes-everything)
- [3. System at a Glance](#3-system-at-a-glance)
- [4. Technology Stack](#4-technology-stack)
- [5. System Architecture](#5-system-architecture)
- [6. Database Design](#6-database-design)
- [7. Module Build Guides](#7-module-build-guides)
  - [7.1 Question Bank](#71-question-bank-module)
  - [7.2 Examination Engine](#72-examination-engine)
  - [7.3 Student Results & Performance Analytics](#73-student-results--performance-analytics)
  - [7.4 AI Tutor System](#74-ai-tutor-system)
  - [7.5 Question Paper Studio & Export System](#75-question-paper-studio--export-system)
  - [7.6 Admin Dashboard & Content Management](#76-admin-dashboard--content-management)
  - [7.7 Authentication & Security](#77-authentication--security)
- [8. Proposed Project Structure](#8-proposed-project-structure)
- [9. API & Security Principles](#9-api--security-principles)
- [10. AI-Assisted Development Workflow](#10-ai-assisted-development-workflow)
- [11. Phased Roadmap — MVP First](#11-phased-roadmap--mvp-first)
- [12. Testing Strategy](#12-testing-strategy)
- [13. Deployment Architecture](#13-deployment-architecture)
- [14. Common Architectural Mistakes to Avoid](#14-common-architectural-mistakes-to-avoid)
- [15. Non-Negotiable Architectural Decisions](#15-non-negotiable-architectural-decisions)
- [16. Getting Started Checklist](#16-getting-started-checklist)
- [Appendix A: Ready-to-Use AI Prompts](#appendix-a-ready-to-use-ai-prompts)
- [Appendix B: Environment Variables Template](#appendix-b-environment-variables-template)
- [Appendix C: Glossary](#appendix-c-glossary)

---

## 1. Project Vision

This platform is **eight interconnected systems**, not one website:

| # | System | Purpose |
|---|--------|---------|
| 1 | **Question Bank Management** | Store, filter, search, and version every question |
| 2 | **Online Examination System** | Generate, run, and evaluate timed exams |
| 3 | **Student Account & Performance Tracking** | Profiles, history, analytics, weak-topic detection |
| 4 | **AI Tutor System** | Context-aware explanations grounded in the answer key |
| 5 | **Question Paper / Exam Paper Generator** | Editable paper studio (separate from the bank) |
| 6 | **PDF & Multi-format Export** | PDF, TXT, JSON, Base64 — rendered from a document model |
| 7 | **Administration & Content Management** | Question, subject, board, user, and settings management |
| 8 | **Authentication & Authorization** | Roles, permissions, audit logs, secure sessions |

### Two interfaces, one backend

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND 01 — STUDENT PLATFORM                                 │
│  Question Bank · Exam Builder · Online Exam · Performance       │
│  AI Tutor · Question Export · Profile · Exam History            │
├─────────────────────────────────────────────────────────────────┤
│  FRONTEND 02 — ADMINISTRATION PLATFORM                          │
│  Dashboard · Question Mgmt · User Mgmt · Paper Mgmt             │
│  Subject/Topic Mgmt · Analytics · Permissions · Settings        │
├─────────────────────────────────────────────────────────────────┤
│  SHARED BACKEND + DATABASE (single source of truth)             │
└─────────────────────────────────────────────────────────────────┘
```

### Complete information flow

```
Admin adds a question
        │
        ▼
Question becomes available in the bank
        │
        ▼
Student selects it through filters / exam builder
        │
        ▼
Examination engine generates a test (snapshot saved)
        │
        ▼
Student submits answers
        │
        ▼
Evaluation engine calculates the score (server-side only)
        │
        ▼
Result is saved in the database
        │
        ▼
Analytics updates the student's performance
        │
        ▼
AI Tutor can explain the questions answered incorrectly
```

> **Design principle:** Build these as **separate, well-organized modules** inside one application that communicate through clear service boundaries. This makes the platform easier to maintain, extend, debug, and scale.

---

## 2. The One Decision That Shapes Everything

> **Question:** Should this platform support *only* HSC/ALIM ICT initially, or eventually other subjects and levels (SSC, JSC, etc.)?

**Recommendation (adopted in this blueprint): Design for multiple education levels, subjects, and groups from day one — even if v1 ships only HSC/ALIM ICT content.**

Why this matters:

- It influences the **database taxonomy** (EducationLevel → Subject → Topic → Subtopic).
- It influences the **filtering system** (level → group → subject → topic cascade).
- It influences **question metadata** (board, year, college, source are relations, not strings).
- Retrofitting multi-level support later means redesigning the question table.

**Practical rule:** Never store board, year, subject, or topic as free-text strings on a question. Always use separate entities with foreign keys (see [§6](#6-database-design)).

---

## 3. System at a Glance

### 3.1 Layered architecture

```
┌──────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                          │
│  Student Website · Admin Dashboard · Mobile Responsive UI    │
├──────────────────────────────────────────────────────────────┤
│  APPLICATION / API LAYER  (Next.js Server Actions +          │
│  Route Handlers + Validation)                                │
│                                                              │
│  Question Service   Exam Engine     Evaluation Engine        │
│  AI Tutor Service   User Service    Analytics Service        │
│  Export Service     Admin Service                             │
├──────────────────────────────────────────────────────────────┤
│  DATA & INFRASTRUCTURE                                       │
│  PostgreSQL (structured data)                                │
│  Object Storage (images, diagrams, files)                    │
│  AI Provider (OpenAI API — tutor & explanations)             │
│  Document Renderer (PDF / exports)                           │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Critical architectural rule

> **The browser must never be trusted to calculate official examination results.**

The **server** must control:

- [ ] The official answer key
- [ ] Examination start and expiry times
- [ ] Submission acceptance / rejection
- [ ] Score calculation
- [ ] Result persistence
- [ ] Student permissions

This prevents score manipulation and bypassing exam restrictions via browser tools.

---

## 4. Technology Stack

### 4.1 Recommended stack

| Technology | Role | Notes |
|------------|------|-------|
| **Next.js + React** | Frontend, routing, SSR, backend API | Unified app architecture |
| **TypeScript** | Application language (frontend + backend) | Strict mode everywhere |
| **Tailwind CSS** | Styling & responsive design | Design system tokens |
| **PostgreSQL** | Main relational database | Single source of truth |
| **Prisma ORM** | Queries, models, migrations | Type-safe data access |
| **Supabase** | Auth, managed PostgreSQL, file storage | Reduces infra management |
| **Redis** *(optional, later)* | Caching, rate limiting, temp exam state | Add only when needed |
| **OpenAI API** | AI Tutor & explanations | Server-side key only |
| **Vercel** | Deployment & hosting | Production + staging |
| **Tiptap** | Rich-text question editor | Block-based editing |
| **KaTeX** | Mathematical notation | In questions & PDFs |
| **Shiki / Highlight.js** | Code highlighting | HTML/code snippets |
| **Playwright** | PDF rendering + browser automation | HTML/CSS → PDF |
| **Vitest + RTL** | Unit / component / API testing | See [§12](#12-testing-strategy) |

### 4.2 Why this combination

- **One language everywhere:** TypeScript across frontend and backend.
- **PostgreSQL** gives a strong relational foundation for questions, subjects, exams, users, and results.
- **Supabase** reduces infrastructure you must manage (auth + storage + managed Postgres).
- **Next.js** provides a unified application architecture (UI + API in one codebase).

### 4.3 Architecture style: Modular monolith

> **Start with a modular monolith, not microservices.**

One application with clearly separated modules (see [§8](#8-proposed-project-structure)). Split individual services later **only if actual usage justifies it**.

---

## 5. System Architecture

### 5.1 Module boundaries

Each module owns its domain logic and exposes a narrow interface:

| Module | Responsibility | Must never do |
|--------|---------------|---------------|
| **Question Service** | CRUD, filtering, versioning, assets | Score exams |
| **Exam Engine** | Session lifecycle, timer, snapshots | Expose answer keys early |
| **Evaluation Engine** | Scoring, CQ rubric storage | Trust client-computed scores |
| **AI Tutor Service** | Grounded explanations, caching | Invent correct answers |
| **User Service** | Profiles, roles, permissions | Grant admin access to students |
| **Analytics Service** | Aggregations, weak-topic rules | Overwrite raw answer records |
| **Export Service** | Document model → PDF/TXT/JSON/Base64 | Edit the question bank directly |
| **Admin Service** | Content ops, audit logging | Skip audit logs for sensitive changes |

### 5.2 Server-authoritative examination (summary)

```
Student starts exam
        │
        ▼
Server stores:  startedAt = now(),  expiresAt = startedAt + duration
        │
        ▼
Browser shows countdown derived from expiresAt
        │
        ▼
On every answer / final submission, server checks:
        │
        ├── now() < expiresAt  → accept
        └── now() >= expiresAt → reject (strict timed mode)
```

Full details in [§7.2](#72-examination-engine).

---

## 6. Database Design

> **Spend significant time here before building any UI.** Almost every feature depends on how questions, exams, users, and results are stored. A poor schema creates problems when adding new boards, years, question types, subjects, or exam formats.

### 6.1 Database entities (logical model)

```
Academic structure
  EducationLevel · Subject · Topic · Subtopic
  Board · College · AcademicYear

Question management
  Question · QuestionOption · QuestionAsset
  QuestionTag · QuestionSource · AnswerKey · QuestionVersion

Examination management
  Exam · ExamQuestion · ExamSession
  StudentAnswer · ExamResult

Student management
  User · StudentProfile · UserRole
  PerformanceSnapshot · SavedQuestion

AI & administration
  TutorConversation · TutorMessage · AIExplanation
  AdminAuditLog · SystemSetting
```

Some entities can be combined or introduced later depending on final requirements — but the boundaries above should guide the schema.

### 6.2 Relationship design

```
Subject
   └── Topic
         └── Subtopic

Question
   ├── Subject ID        (FK)
   ├── Topic ID          (FK)
   ├── Board ID          (FK, nullable)
   ├── Year ID           (FK, nullable)
   └── Question Type     (enum: MCQ | CQ)

QuestionSource            ← many-to-many: a question may appear
   ├── Question ID        in multiple papers / boards / colleges
   ├── Source Type        (BOARD | COLLEGE | MODEL_TEST | ...)
   ├── College ID (opt.)
   ├── Board ID   (opt.)
   └── Year
```

**Key rules:**

- [ ] Use foreign keys for subject / topic / board / year / college — never free-text.
- [ ] Use a separate `QuestionSource` relation — a question can belong to multiple boards/papers.
- [ ] Keep question content separate from images/attachments (files in object storage, referenced by asset ID).

### 6.3 Question structure — structured document, not plain text

A question must support: Bengali text, English text, math expressions, images, circuit diagrams, flowcharts, tables, HTML/code snippets, MCQ + CQ, different marking schemes, multiple sources.

**Illustrative document structure** (relational core + JSONB for flexible content blocks):

```jsonc
{
  "id": "question_001",
  "subject": "ICT",
  "educationLevel": "HSC",
  "type": "MCQ",
  "question": {
    "format": "rich_text",
    "content": [
      { "type": "paragraph", "text": "Which number system is used in computers?" },
      { "type": "image", "assetId": "asset_001", "alt": "Number system diagram" }
    ]
  },
  "options": [
    { "key": "A", "content": "Decimal" },
    { "key": "B", "content": "Binary" },
    { "key": "C", "content": "Octal" },
    { "key": "D", "content": "Hexadecimal" }
  ],
  "correctAnswer": "B",
  "marks": 1,
  "negativeMarks": 0,
  "board": "Dhaka",
  "year": 2025,
  "topic": "Number System",
  "difficulty": "MEDIUM"
}
```

> This is an **illustrative document**, not a recommendation to store the whole database as JSON. Use **relational tables for core data** and **JSONB for flexible rich-content blocks** where appropriate.

### 6.4 Rich-text question editor (build this early)

Do **not** use a simple textarea for adding questions.

| Capability | Tool |
|------------|------|
| Rich text | **Tiptap** (block-based) |
| Math | **KaTeX** |
| Code highlighting | **Shiki** or Highlight.js |
| Images / diagrams | Upload → object storage → asset reference |
| Tables, lists | Tiptap extensions |

> For circuit diagrams and ICT flowcharts, images are **first-class question assets**, not pasted unstructured text.

### 6.5 Schema engineering checklist

When designing the Prisma schema, cover:

- [ ] Normalized relational tables with PK/FK and cardinalities
- [ ] Indexes on filter paths (subject, topic, board, year, type, difficulty)
- [ ] JSONB usage justified per-field (content blocks, snapshots)
- [ ] Constraints & validation rules (marks ≥ 0, options count, etc.)
- [ ] Deletion & retention policies (soft-delete questions; never hard-delete answered ones)
- [ ] Question versioning (`QuestionVersion`) so exams preserve what students saw
- [ ] Migration strategy (Prisma Migrate; never edit applied migrations)

---

## 7. Module Build Guides

---

### 7.1 Question Bank Module

*First major student-facing module.*

#### 7.1.1 Filtering system

Students filter by:

| Filter | Example |
|--------|---------|
| Education level | HSC / Alim |
| Group | Science / Humanities / Business Studies |
| Subject | ICT |
| Board | Dhaka / Rajshahi / Cumilla |
| Year | 2020–2026 |
| Topic | Number System |
| Subtopic | Binary Conversion |
| Type | MCQ / CQ |
| College | Selected college |
| Difficulty | Easy / Medium / Hard |
| Source | Board / College / Model Test |

**Dynamic cascade:**

```
1. Student selects HSC
2. Student selects ICT
3. Topic list shows available ICT topics
4. Student selects Number System
5. Question list updates
6. Student further filters by year and board
```

**Implementation rules:**

- [ ] Server-side filtering + pagination (never download thousands of questions to the browser)
- [ ] Filter options derived from actual data (counts per facet)
- [ ] Search across question text (Bengali + English)

#### 7.1.2 Question selection — two methods

**A. Manual selection** — student browses filtered questions and picks them.

**B. Automatic selection** — student configures:

- Number of questions
- Question type (MCQ / CQ / Both)
- Topics
- Difficulty
- Board / year
- Random or sequential selection
- Time limit

Example configuration UI:

```
┌─────────────────────────────────────────────┐
│  Create your practice test                  │
│                                             │
│  Subject        ICT – HSC                   │
│  Question type  (•) MCQ  ( ) CQ  ( ) Both   │
│  Number         [ 20 ]                      │
│  Selection      (•) Random  ( ) Sequential  │
│  Time limit     [ 30 ] minutes              │
│                                             │
│  YOUR CONFIGURATION                         │
│  20 questions · MCQ · Random · 30 minutes   │
└─────────────────────────────────────────────┘
```

#### 7.1.3 Random selection algorithm

> Do **not** rely on a naive `ORDER BY RANDOM()`.

```
1. Apply all filters
2. Check available question counts
3. Validate the requested count is possible (error if not)
4. Select questions randomly
5. Optionally balance by topic and difficulty
6. Save selected question IDs + versions in an exam snapshot
```

For large banks, use efficient sampling strategies rather than sorting the entire table. Goal: avoid entirely unbalanced tests.

#### 7.1.4 Acceptance criteria

- [ ] Filters cascade correctly (level → subject → topic)
- [ ] Pagination works with combined filters
- [ ] Random selection validates counts and balances topics
- [ ] Insufficient-question case shows a clear error, not a partial test
- [ ] Questions with images/code/Bengali text render correctly

---

### 7.2 Examination Engine

*The most technically sensitive module. Design it as a **state-based system**.*

#### 7.2.1 Examination lifecycle (state machine)

```mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> READY: student ready to begin
    READY --> IN_PROGRESS: timer starts (server)
    IN_PROGRESS --> SUBMITTED: student submits in time
    IN_PROGRESS --> EXPIRED: time limit reached
    SUBMITTED --> EVALUATED: scoring complete
    EXPIRED --> EVALUATED: (strict mode: no submission accepted)
```

| State | Meaning |
|-------|---------|
| **CREATED** | Exam generated and configured |
| **READY** | Student is ready to begin |
| **IN_PROGRESS** | Questions can be answered |
| **SUBMITTED** | Answers successfully submitted |
| **EXPIRED** | Time limit reached; submission closed |
| **EVALUATED** | Result calculated and saved |

#### 7.2.2 Timer implementation — server-authoritative

> **Common mistake:** implementing the timer only with JavaScript `setInterval()`. Students can refresh, change the clock, manipulate JS, disconnect, or open another tab.

**Correct implementation:**

```ts
// On exam start (server)
startedAt = serverNow()
expiresAt = startedAt + allowedDurationMs
// Persist both timestamps in ExamSession

// On every answer save / final submission (server)
if (serverNow() < expiresAt) {
  acceptSubmission()
} else {
  rejectSubmission() // strict timed exam
}
```

**Modes:**

| Mode | Behavior at expiry |
|------|-------------------|
| **Strict timed exam** *(default, v1)* | No new answers or final submission accepted |
| **Practice exam** *(later, optional)* | Automatic submission at expiry |

#### 7.2.3 Examination interface

Include:

- [ ] Question navigation panel
- [ ] Current question number
- [ ] Countdown timer (derived from server `expiresAt`)
- [ ] Previous / Next buttons
- [ ] Mark for review
- [ ] Answer selection
- [ ] Answered / unanswered status
- [ ] Submit confirmation
- [ ] Responsive mobile interface

**Additional rules:**

- [ ] Save answers periodically on the server (rate-limited, with retry handling)
- [ ] Preserve the **exact question version** shown to the student — if an admin edits the original mid-exam, existing exams must not silently change
- [ ] Persist the exam snapshot (question IDs + versions) at generation time — never regenerate on refresh

#### 7.2.4 Scoring engine

**MCQ:**

```
Score = Correct × Marks − Incorrect × NegativeMarks
```

**CQ:**

- Store the student's written response
- Store maximum marks
- Provide a marking rubric
- Support manual evaluation
- Optionally support AI-assisted evaluation **with teacher/admin review**

> Never treat AI-generated CQ marks as unquestionably correct.

#### 7.2.5 Acceptance criteria

- [ ] Refresh / new tab / clock change cannot extend the exam
- [ ] Submission after expiry is rejected by the server
- [ ] One student cannot access or alter another student's answers
- [ ] Admin editing a question mid-exam does not affect active sessions
- [ ] Boundary condition (submit ≈ expiry) resolves consistently by server timestamp + transaction rules

---

### 7.3 Student Results & Performance Analytics

*This transforms the platform from a question bank into a learning platform.*

#### 7.3.1 Student dashboard metrics

| Metric | Description |
|--------|-------------|
| Total exams | Number of completed examinations |
| Total questions | Questions attempted |
| Accuracy | Correct answers / evaluated answers |
| Average score | Average exam score |
| Best score | Highest achieved score |
| Improvement | Performance over time |

#### 7.3.2 Topic-wise performance

```
ICT topic-wise performance (illustrative data)
Number System    ████████████████  85%
Digital Device   ████████████      65%
HTML             █████████████     72%
Database         ████████          48%
Programming      █████████████████ 90%
```

#### 7.3.3 Improvement tracking & weak-topic detection

Track performance across: daily, weekly, monthly, topic-wise, board-wise, question-type-wise.

**Weak-topic insight (rule-based first — no AI required):**

> *"Your accuracy in Database Management is lower than in Number System. Consider practising more database questions."*

#### 7.3.4 Critical data rule

> **Save individual student answers, not just total scores.** Otherwise you lose the ability to analyze where students make mistakes.

#### 7.3.5 Acceptance criteria

- [ ] Every evaluated answer is stored per-question (correct/incorrect, marks)
- [ ] Dashboard aggregates are derived from stored answers
- [ ] Topic-wise accuracy and trends render correctly
- [ ] Weak-topic rule produces sensible recommendations

---

### 7.4 AI Tutor System

*Build a **context-aware tutor**, not a generic chatbot.*

#### 7.4.1 Two core functions

**Function A — Explain any question** (`Explain with AI Tutor`)

The AI receives: question text, type, options (if MCQ), correct answer, topic/subtopic, educational context.

It generates:

1. Conceptual introduction
2. Step-by-step explanation
3. Correct-answer reasoning
4. Why other options are incorrect
5. A useful learning takeaway

**Function B — Explain why my answer is wrong**

Example: correct = *Binary*, student = *Decimal*.

The AI receives the student's actual answer and explains the **conceptual misunderstanding** — not just a repeat of the correct answer.

#### 7.4.2 Architecture

```
Student selects a question
        │
        ▼
Clicks "Ask AI Tutor"
        │
        ▼
Backend AI Tutor Service
  ├── Question information
  ├── Correct answer (from DB answer key)
  ├── Student's answer (if any)
  └── Topic information
        │
        ▼
AI Provider API (OpenAI — server-side key only)
        │
        ▼
Structured explanation (validated JSON)
        │
        ▼
Tutor interface
```

#### 7.4.3 Structured AI responses

Instruct the AI to return structured JSON; the backend **validates** it before display:

```jsonc
{
  "concept": "Binary number system",
  "correctAnswer": "Binary",
  "studentAnswer": "Decimal",
  "explanation": "Computers represent data using binary digits...",
  "whyStudentWasWrong": "Decimal uses ten digits, whereas binary uses two.",
  "learningTakeaway": "Remember that binary uses only 0 and 1."
}
```

#### 7.4.4 Critical AI design decision

> **AI must not invent the correct answer.** The database answer key is authoritative.
> If the key is missing or questionable, the tutor must say the answer needs verification instead of confidently inventing one.
> For complex CQ explanations, use a separate workflow that considers the marking rubric.

#### 7.4.5 Cost controls

- [ ] Cache explanations per question version
- [ ] Rate-limit requests per student
- [ ] Store previous explanations (reuse before re-calling AI)
- [ ] Smaller models for straightforward explanations; capable models only for complex ones
- [ ] Track token usage and cost per student

#### 7.4.6 Acceptance criteria

- [ ] API key never appears in frontend code
- [ ] Responses validated against schema before rendering
- [ ] Missing/questionable answer key → explicit "needs verification" response
- [ ] Repeated asks for the same question version hit the cache

---

### 7.5 Question Paper Studio & Export System

*Treat this as a **separate product module**, not a download button.*

#### 7.5.1 Workflow

```
Select questions
      │
      ▼
Create Question Paper
      │
      ▼
Open Paper Editor
  ├── Edit text
  ├── Remove questions
  ├── Reorder questions
  ├── Edit marks
  ├── Add instructions
  └── Add title and information
      │
      ▼
Preview
      │
      ▼
Choose export format
  ├── PDF
  ├── TXT
  ├── JSON
  └── Base64
```

#### 7.5.2 Editable document model (key design decision)

> **Never edit a generated PDF directly.** The editor modifies a structured document model; the renderer generates a new PDF from it.

```jsonc
{
  "title": "HSC ICT Model Test",
  "duration": 30,
  "totalMarks": 20,
  "sections": [
    {
      "title": "Multiple Choice Questions",
      "questions": [
        { "questionId": "question_001", "marks": 1, "order": 1 }
      ]
    }
  ]
}
```

#### 7.5.3 PDF generation

**Recommended: HTML + CSS + Playwright PDF rendering**

Why: full control over headers/footers, Bengali typography, images/diagrams, tables, math, code, page numbering, page sizes, and print styling — then render with a browser engine.

- [ ] Use a Bengali Unicode font (e.g. **Noto Sans Bengali**), embedded/available at render time
- [ ] Test actual output carefully for font shaping and page breaks

#### 7.5.4 Export formats

| Format | Purpose |
|--------|---------|
| **PDF** | Print-ready question paper |
| **TXT** | Plain-text questions |
| **JSON** | Structured question data |
| **Base64** | Encoded file/data transfer |

> **Clarification:** Base64 is an *encoding*, not a document format. Offer clear options: JSON data, Base64-encoded JSON, Base64-encoded PDF. Limit Base64 size (inefficient for large files) and prefer normal file downloads for PDFs.

#### 7.5.5 Acceptance criteria

- [ ] Editor changes the document model, not the PDF
- [ ] Multi-page PDFs: images, Bengali text, page breaks all correct
- [ ] JSON export is valid and re-importable
- [ ] Base64 output decodes back to the original file

---

### 7.6 Admin Dashboard & Content Management

#### 7.6.1 Admin sections

| Section | Functions |
|---------|-----------|
| Dashboard | Overview and statistics |
| Questions | Create, edit, delete, import |
| Subjects | Manage subjects |
| Topics | Manage topics and subtopics |
| Boards | Manage education boards |
| Years | Manage examination years |
| Colleges | Manage college records |
| Exams | Manage model tests and papers |
| Students | Manage student accounts |
| Results | Review examination results |
| AI Tutor | Manage AI settings and explanations |
| Assets | Manage diagrams and images |
| Reports | Question and student analytics |
| Settings | Platform configuration |

#### 7.6.2 Question editor (most polished admin feature)

- [ ] Question type selection
- [ ] Rich-text editor (Tiptap)
- [ ] Image / diagram upload
- [ ] Code block insertion
- [ ] Mathematical equation support (KaTeX)
- [ ] MCQ option editor
- [ ] Correct answer selection
- [ ] Explanation field
- [ ] Marks and negative marks
- [ ] Board and year assignment
- [ ] Topic assignment
- [ ] Difficulty selection
- [ ] Source information
- [ ] Preview before publishing

#### 7.6.3 Bulk import

```
Upload JSON / CSV
       │
       ▼
Validate data
       │
       ▼
Show import preview
       │
       ▼
Find duplicate questions
       │
       ▼
Show errors and warnings
       │
       ▼
Admin confirms
       │
       ▼
Import questions
```

Images import via a separate asset-mapping mechanism or an archive format with explicit file references.

#### 7.6.4 Role-based access control (RBAC)

> Do **not** give every administrator unrestricted access.

| Role | Permissions |
|------|-------------|
| Super Admin | All system operations |
| Content Admin | Question and topic management |
| Exam Manager | Exam and paper management |
| Moderator | Review and approve content |
| Analyst | Read-only reports |

**Audit logging:** Every important change records *who* changed *what* and *when* — especially answer-key changes.

#### 7.6.5 Acceptance criteria

- [ ] Non-privileged roles cannot access restricted sections
- [ ] Answer-key changes appear in the audit log
- [ ] Bulk import blocks on validation errors and flags duplicates
- [ ] Question preview matches the published rendering

---

### 7.7 Authentication & Security

Use **Supabase Auth** (or equivalent managed provider).

**Student registration must support:**

- [ ] Email + password
- [ ] Email verification
- [ ] Password reset
- [ ] Student profile
- [ ] Session management
- [ ] Secure logout

*(Phone-based auth can come later.)*

#### Security non-negotiables

1. [ ] Students cannot access admin endpoints
2. [ ] Students cannot change their own examination scores
3. [ ] Answer keys are not exposed before submission
4. [ ] Timed exams use server timestamps
5. [ ] Uploaded files are validated (type, size, content)
6. [ ] Rich text and code snippets are safely rendered (no arbitrary HTML/JS execution)
7. [ ] API endpoints are rate-limited
8. [ ] AI requests have usage limits
9. [ ] Admin changes are audit-logged
10. [ ] Database access policies prevent unauthorized data access

Also plan: **backups, database migrations, and a recovery plan.**

---

## 8. Proposed Project Structure

```
HSC-ALIM-ICT-Question-Bank/
│
├── docs/                          # Source of truth for AI-assisted dev
│   ├── PROJECT_OVERVIEW.md
│   ├── REQUIREMENTS.md
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── API_SPECIFICATION.md
│   ├── AUTHENTICATION.md
│   ├── EXAM_ENGINE.md
│   ├── AI_TUTOR.md
│   ├── EXPORT_SYSTEM.md
│   ├── ADMIN_PANEL.md
│   ├── SECURITY.md
│   ├── UI_DESIGN_SYSTEM.md
│   └── DEVELOPMENT_ROADMAP.md
│
├── app/                           # Next.js App Router
│   ├── (student)/                 # Student platform routes
│   │   ├── question-bank/
│   │   ├── exam-builder/
│   │   ├── exam/[sessionId]/
│   │   ├── dashboard/
│   │   ├── paper-studio/
│   │   └── profile/
│   ├── (admin)/                   # Admin routes (role-guarded)
│   │   ├── dashboard/
│   │   ├── questions/
│   │   ├── subjects/
│   │   ├── topics/
│   │   ├── boards/
│   │   ├── exams/
│   │   ├── students/
│   │   ├── results/
│   │   └── settings/
│   └── api/                       # Route handlers
│
├── components/                    # Reusable UI components
│   ├── ui/
│   ├── question/
│   ├── exam/
│   └── admin/
│
├── lib/                           # Shared utilities
│   ├── db.ts                      # Prisma client
│   ├── auth.ts
│   ├── validation/                # Zod schemas
│   └── utils/
│
├── server/                        # Business logic (modules)
│   ├── questions/
│   ├── exams/                     # Exam engine + evaluation
│   ├── analytics/
│   ├── ai-tutor/
│   ├── exports/                   # Paper studio + renderers
│   ├── admin/
│   └── users/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/                       # Playwright
│
├── .env.example
├── README.md
└── package.json
```

> **Rule:** Keep business logic in `server/` modules — never inside UI components. Components call services; services enforce rules.

---

## 9. API & Security Principles

### 9.1 API design principles

- [ ] **Validate every server input** (Zod schemas at the boundary)
- [ ] **Authorize on the server** — never rely on hidden UI buttons
- [ ] **Use transactions** where consistency matters (submission + scoring + result save)
- [ ] **Return consistent error shapes** (code + message + field errors)
- [ ] **Paginate all list endpoints** (cursor or offset, with max page size)
- [ ] **Never expose answer keys** in exam-taking responses
- [ ] **Rate-limit** auth, answer-saving, AI, and export endpoints

### 9.2 Safe rendering pipeline

- [ ] Sanitize rich text on save *and* on render
- [ ] Never execute arbitrary HTML/JS from question content
- [ ] Validate uploaded files (magic bytes, extension, size)
- [ ] Serve assets with safe content types and cache headers

---

## 10. AI-Assisted Development Workflow

> **Do not ask AI:** *"Build me an HSC ICT question bank website with all these features."*
> That produces impressive-looking but architecturally inconsistent code — duplicate models, disconnected modules, insecure endpoints.

Instead, use AI as a **team of specialized engineers**:

| Tool | Role |
|------|------|
| **VS Code** | Main development environment |
| **Claude Code** | Agentic coding, implementation, debugging |
| **ChatGPT** | System design, architecture review, problem solving |
| **Figma** | UI/UX design and design system |
| **GitHub** | Version control and code history |

**Rules:**

- [ ] Use **one primary coding agent** at a time (never multiple agents editing the same codebase simultaneously)
- [ ] ChatGPT acts as architecture reviewer / planning partner; the coding agent implements approved tasks
- [ ] Before any task, the agent **reads the relevant `docs/` files first** (schema, auth rules, exam lifecycle, etc.)
- [ ] Work on **one approved module at a time**; do not modify unrelated modules
- [ ] After implementation: run tests → type-check → lint → fix → summarize changes, decisions, and remaining issues

### 10.1 Documentation-first workflow

```
docs/  ← shared source of truth
  │
  ▼
Agent reads relevant docs
  │
  ▼
Agent inspects repo + schema + existing components
  │
  ▼
Agent implements one module
  │
  ▼
Tests + type-check + lint pass
  │
  ▼
Docs updated if behavior changed
```

Ready-to-use prompts are in [Appendix A](#appendix-a-ready-to-use-ai-prompts).

---

## 11. Phased Roadmap — MVP First

> Do not launch all features simultaneously. Ship a working educational platform early without sacrificing long-term architecture.

### Phase 01 — Requirements & Architecture *(Foundation)*

- [ ] Finalize functional requirements
- [ ] Define user roles
- [ ] Design database relationships
- [ ] Define API contracts
- [ ] Create technical documentation (`docs/`)

### Phase 02 — UI/UX & Design System

- [ ] Design student dashboard, question bank, exam interface, admin dashboard
- [ ] Establish typography (Bengali + English), colors, spacing, components

### Phase 03 — Project Setup

- [ ] Configure Next.js + TypeScript
- [ ] Configure Tailwind CSS
- [ ] Configure PostgreSQL + Prisma
- [ ] Set up authentication (Supabase Auth)
- [ ] Set up dev + production environments

### Phase 04 — Academic & Question Management *(Milestone 1)*

- [ ] Subject, topic, board management
- [ ] Question CRUD (MCQ + CQ)
- [ ] Rich-text question editor
- [ ] Image & diagram management
- [ ] Filtering and search

### Phase 05 — Examination Engine *(Milestone 2)*

- [ ] Exam configuration
- [ ] Manual + random selection
- [ ] Question snapshots
- [ ] Server-authoritative timer
- [ ] Answer saving
- [ ] Server-side submission validation
- [ ] Evaluation and scoring

### Phase 06 — Student Dashboard

- [ ] Registration and login
- [ ] Exam history
- [ ] Saved results
- [ ] Performance charts
- [ ] Topic-wise analytics

### Phase 07 — AI Tutor

- [ ] AI API integration
- [ ] Question explanations
- [ ] Wrong-answer analysis
- [ ] Conversation history
- [ ] Cost controls and caching

### Phase 08 — Paper Studio & Exports

- [ ] Question paper builder
- [ ] Editable paper document model
- [ ] PDF rendering (Playwright)
- [ ] TXT / JSON / Base64 exports

### Phase 09 — Advanced Admin

- [ ] Bulk import
- [ ] User management
- [ ] Role management (RBAC)
- [ ] Audit logs
- [ ] Analytics
- [ ] Content moderation

### Phase 10 — Testing & Deployment

- [ ] Unit + integration tests
- [ ] Browser automation (Playwright)
- [ ] Security testing
- [ ] Performance testing
- [ ] Production deployment

> **Gate rule:** Do not move to the next phase merely because the current interface *looks* finished. Each phase must pass its acceptance tests.

### Release plan

| Version | Scope |
|---------|-------|
| **v1 — Essential platform** | Registration/login · Subject/topic/board mgmt · MCQ+CQ bank · Filtering · Random selection · Timed exams · Server-side evaluation · Saved results · Basic dashboard · Admin question mgmt |
| **v2 — Learning platform** | Advanced analytics · AI Tutor · Wrong-answer explanations · Bookmarking · Exam history & comparisons |
| **v3 — Advanced platform** | Paper Studio · PDF/TXT/JSON/Base64 exports · Bulk import · Advanced admin analytics · AI-assisted CQ evaluation · Advanced content mgmt |

---

## 12. Testing Strategy

Do not leave testing until the end.

| Testing type | Tool |
|--------------|------|
| Unit testing | Vitest |
| Component testing | React Testing Library |
| API integration | Vitest |
| Browser automation | Playwright |
| Database testing | PostgreSQL test database |
| Type checking | TypeScript |
| Code quality | ESLint |

### Critical scenarios

**Examination**

- [ ] Student starts an exam
- [ ] Student refreshes the page
- [ ] Student loses internet temporarily
- [ ] Timer expires
- [ ] Student attempts submission after expiry
- [ ] Student tries to change another student's answers
- [ ] Admin edits a question during an active exam
- [ ] Two browser tabs access the same exam

**Question bank**

- [ ] Filter combinations
- [ ] Random selection
- [ ] Insufficient question count
- [ ] Duplicate questions
- [ ] Questions containing images / code
- [ ] Bengali text rendering

**Export**

- [ ] Multi-page PDFs
- [ ] Image placement
- [ ] Bengali font rendering
- [ ] Page breaks
- [ ] JSON validity
- [ ] Base64 decoding
- [ ] Large question papers

> **Timer boundary test:** Specifically test submission vs. expiry at nearly the same instant. The server timestamp and transaction rules must determine the outcome consistently.

---

## 13. Deployment Architecture

Initially, use managed services — avoid spending time managing servers.

```
Students & Administrators (browsers / mobile devices)
        │
        ▼
Vercel — Next.js application hosting
        │
        ├── Supabase — PostgreSQL + Auth
        ├── Object Storage — images & assets
        ├── OpenAI API — AI Tutor
        └── PDF Worker — document rendering
```

**Production considerations:**

- [ ] PDF rendering is resource-intensive → eventually run in a **separate background worker** instead of blocking web requests
- [ ] Custom domain + HTTPS
- [ ] Database backups
- [ ] Error monitoring + application logging
- [ ] Usage monitoring + rate limiting
- [ ] Separate staging and production environments

**Bangladesh-focused priorities:** mobile performance, slower internet connections, Bengali fonts, and image optimization.

---

## 14. Common Architectural Mistakes to Avoid

| Mistake | Better approach |
|---------|-----------------|
| Building everything in one component | Modular component architecture |
| Storing all questions as plain text | Structured rich-content model |
| Putting images inside database records | Object storage with asset references |
| Calculating exam scores in the frontend | Server-side evaluation |
| Using browser-only timers | Server-authoritative expiry |
| Generating a new random test on every refresh | Persisted exam snapshots |
| Giving AI authority to decide correct answers | Database answer key as source of truth |
| Creating PDF directly from screenshots | Structured document rendering |
| Giving all admins full permissions | Role-based access control |
| Asking AI to generate the whole application | Small, documented implementation tasks |
| Skipping automated tests | Test each module and integration |

---

## 15. Non-Negotiable Architectural Decisions

1. **Modular monolith** — one well-organized application, not premature microservices.
2. **PostgreSQL** — single source of truth for academic content and examination records.
3. **Versioned questions** — exam papers preserve the question versions students actually received.
4. **Server-controlled examination** — timer, submission, answer validation, and scoring enforced on the backend.
5. **Structured content** — images, code, math, and diagrams supported from the beginning.
6. **AI as an assistant** — explanations grounded in verified question data; never invent answers.
7. **Independent PDF rendering** — paper editing and rendering separated from the question bank.
8. **Auditability** — important administrative changes are traceable.
9. **Automated testing** — especially for the examination engine.
10. **Documentation-first AI development** — every coding agent follows the same approved architecture.

---

## 16. Getting Started Checklist

Before writing the first line of application code:

- [ ] **Confirm the scope decision** (§2): multi-level design from day one, HSC/ALIM ICT content first
- [ ] Write the **Software Requirements Specification (SRS)** → `docs/REQUIREMENTS.md`
- [ ] Design the **database architecture** → `docs/DATABASE_SCHEMA.md` + Prisma schema draft
- [ ] Define **API contracts** → `docs/API_SPECIFICATION.md`
- [ ] Define **exam lifecycle + timer rules** → `docs/EXAM_ENGINE.md`
- [ ] Define **auth + RBAC rules** → `docs/AUTHENTICATION.md`
- [ ] Create the remaining `docs/` files (§8)
- [ ] Scaffold the project (Phase 03)
- [ ] Build Phase 04 (Question Management) as the first milestone

---

## Appendix A: Ready-to-Use AI Prompts

Use structured prompts per task — never one enormous prompt.

### Prompt 01 — System Architecture

```
Act as a senior software architect with extensive experience designing
large-scale educational platforms.

I am building an HSC/ALIM ICT Question Bank and Online Examination Platform.

Technology preferences:
- Next.js, React, TypeScript, Tailwind CSS
- PostgreSQL, Prisma ORM
- Supabase Authentication, Supabase Storage
- OpenAI API

Core modules:
1. Question Bank
2. Examination Engine
3. Student Management
4. Performance Analytics
5. AI Tutor
6. Question Paper Generator
7. PDF/TXT/JSON/Base64 Export
8. Admin Dashboard

Your task:
1. Analyze the requirements.
2. Identify missing requirements and technical risks.
3. Design the complete system architecture.
4. Define module boundaries and responsibilities.
5. Design the database entities and relationships.
6. Define the API architecture.
7. Explain authentication and authorization.
8. Design the examination lifecycle.
9. Design the AI Tutor integration.
10. Recommend a scalable deployment architecture.

Important constraints:
- Do not write application code yet.
- Do not skip database design.
- Do not overengineer with microservices.
- Make all major design decisions explicit.
- Identify assumptions and ask for clarification when necessary.

Produce professional technical documentation in Markdown.
```

### Prompt 02 — Database Engineering

```
Act as a senior PostgreSQL database architect.

Design a production-quality relational database for my HSC/ALIM ICT
Question Bank platform.

Requirements:
- Multiple education levels, groups, and subjects
- Multiple boards, examination years, colleges
- Topics and subtopics
- MCQ and CQ questions
- Rich-text content, images, diagrams, code snippets
- Question sources, multiple question versions
- Student accounts, examination sessions, student answers, results
- Performance analytics, AI Tutor conversations
- Admin roles and audit logs

Tasks:
1. Design normalized relational tables.
2. Define primary and foreign keys.
3. Define cardinalities and relationships.
4. Recommend indexes.
5. Explain JSONB usage where appropriate.
6. Define constraints and validation rules.
7. Identify deletion and data-retention policies.
8. Generate a Prisma schema.
9. Explain migration strategy.

Do not generate frontend code.
Avoid unnecessary duplication and denormalization.
```

### Prompt 03 — UI/UX Design

```
Act as a senior product designer specializing in educational SaaS platforms.

Design the UI/UX architecture for an HSC/ALIM ICT Question Bank platform.

Two interfaces:
1. Student platform — question bank with filters, MCQ/CQ viewing,
   exam creation, random selection, timed exams, instant results,
   performance tracking, AI Tutor, paper editor, multiple exports.
2. Admin dashboard — question management, rich-text editor,
   image/diagram upload, topic/board management, user management,
   exam management, analytics.

Requirements:
- Professional educational SaaS aesthetic
- Responsive desktop, tablet, and mobile layouts
- Excellent Bengali and English typography
- Accessible interface, consistent design system, reusable components

First produce:
1. Sitemap
2. User journeys
3. Screen inventory
4. Wireframe descriptions
5. Design system
6. Component architecture

Do not start implementing the application until the design structure is approved.
```

### Prompt 04 — Development Implementation

```
Act as a senior full-stack engineer.

Implement the approved HSC/ALIM ICT Question Bank platform architecture.

Before writing code:
1. Read the project documentation.
2. Inspect the existing repository.
3. Understand the current database schema.
4. Identify existing reusable components.
5. Identify dependencies and integration points.

Implementation rules:
- Use TypeScript strictly.
- Follow the approved architecture.
- Keep business logic separate from UI components.
- Use reusable components.
- Validate all server inputs.
- Enforce authorization on the server.
- Use database transactions where necessary.
- Handle errors properly.
- Write meaningful tests.
- Do not expose secrets.
- Do not create duplicate database entities.
- Do not silently change existing API contracts.

Work on one approved module at a time.

After implementation:
1. Run relevant tests.
2. Run TypeScript checks.
3. Run linting.
4. Fix errors.
5. Summarize files changed.
6. Explain implementation decisions.
7. Identify remaining issues.

Do not modify unrelated modules.
```

---

## Appendix B: Environment Variables Template

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/hsc_ict_bank"
DIRECT_URL="postgresql://user:password@localhost:5432/hsc_ict_bank"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"   # server only

# AI Tutor (server only — never expose to the browser)
OPENAI_API_KEY="sk-..."

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

> **Never commit real secrets.** Keep `.env` in `.gitignore`; commit only `.env.example`.

---

## Appendix C: Glossary

| Term | Meaning |
|------|---------|
| **MCQ** | Multiple Choice Question |
| **CQ** | Creative Question (written-response question) |
| **HSC** | Higher Secondary Certificate |
| **ALIM** | Alim (madrasa education level, equivalent to HSC) |
| **ICT** | Information and Communication Technology |
| **RBAC** | Role-Based Access Control |
| **SRS** | Software Requirements Specification |
| **JSONB** | PostgreSQL binary JSON type for flexible structured data |
| **MVP** | Minimum Viable Product |
| **Snapshot** | Immutable copy of the exact questions/versions shown in an exam |

---

*This README is a living blueprint. As implementation proceeds, update the relevant `docs/` files first, then reflect decisions here. When in doubt, follow the non-negotiable decisions in [§15](#15-non-negotiable-architectural-decisions).*
