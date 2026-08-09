# AWSDesk — Claude Code Project Context

> This file is read automatically by Claude Code at the start of every session.
> It covers both `awsdesk-web` (this repo) and `awsdesk-api` (the companion API repo).
> Keep it updated as the project evolves.

---

## What AWSDesk is

A Vercel-style internal developer platform (IDP) that replaces the AWS console
for DevOps work. The goal is to make every AWS workflow that is painful in the
console beautiful and safe in a purpose-built dashboard — one capability at a time.

Built by Ramon Garcia (regtech/software engineer, Singapore) as a personal
initiative. Manages multiple AWS accounts via cross-account STS AssumeRole
with a hub-and-spoke model.

---

## Repos

| Repo | Stack | Purpose |
|------|-------|---------|
| `awsdesk-web` | React 18 + Vite | Dashboard frontend |
| `awsdesk-api` | Fastify 5 + TypeScript + Neon Postgres | API, AWS access, job engine |

Both repos are on GitHub (`monmargarcia/`) and deployed on Vercel free tier
(personal use). Ramon handles all deployments himself:
`npm install` → `vercel --prod`. Never assume auto-deploy from git push.

---

## Design system — never deviate from this

The visual language is Vercel-inspired: dark canvas, one accent color,
monospace for everything technical, status dots instead of badges.

```
Colors
  Background ............. #080b12
  Card / surface ......... #0e1420
  Border ................. #1d2736
  Primary text ........... #f5f7fa
  Dim text ............... #8b95a5
  Faint / placeholder .... #5a6577
  Green (healthy/accent) . #00C896
  Red (error/alarm) ...... #f5455c
  Blue (private subnet) .. #4f9cf9
  Amber (drift/warning) .. #e8b339

Typography
  UI text ................ Inter, -apple-system, sans-serif
  All identifiers ........ 'SF Mono', 'Fira Code', ui-monospace, monospace
    (ARNs, CIDRs, IPs, resource names, timestamps, account IDs)

Components
  Status ................. 7px colored dot + text label. Never big badges.
  Borders ................ hairline (1px), no box shadows
  Card hover ............. border-color → #00C89666
  Animations ............. slide-up on page/tab transitions (0.2s ease)
                           pulse on firing alarms only
  Danger zone ............ red-bordered box at bottom of Settings,
                           requires typing resource name to confirm
  Toasts ................. bottom-right, green border, 2.6s auto-dismiss
  Empty state ............ ⬡ icon + plain "Nothing here in {account}" text
```

---

## awsdesk-web structure

```
src/
  App.jsx           ← root shell: login, account switcher, tab routing
  lib/
    api.js          ← all fetch calls to the API (credentials: include)
  components/       ← shared: Dot, Spark, TopologyView, etc. (add here)
  pages/            ← one file per major tab if it grows large
index.html
vite.config.js      ← /api proxied to http://localhost:3000 in dev
```

### awsdesk-web has NO .env file

The web app has no secrets. All AWS and database access lives in `awsdesk-api`.
The Vite proxy handles `/api → :3000` in local dev automatically.
In production, the web fetches from the same Vercel domain (relative `/api`).

---

## awsdesk-api structure

```
src/
  lib/
    aws.ts          ← SINGLE gateway for ALL AWS access
                       getClient(accountId, service) → SDK client
                       STS AssumeRole per spoke account, 15-min cached creds
                       NEVER construct SDK clients anywhere else in the codebase
    db.ts           ← pg Pool, listAccounts(), getAccount(), audit()
  routes/
    resources.ts    ← GET routes: ECS, RDS, CloudWatch alarms, Secrets
    topology.ts     ← GET /topology: VPC graph from EC2 describe calls
  server.ts         ← Fastify app entry, cookie-session auth, route registration
db/
  schema.sql              ← run once against Neon to create all tables
  onboard-account.cfn.yaml ← CloudFormation: deploy in each spoke account
api/
  index.ts          ← Vercel serverless entry (wraps the Fastify app)
```

### TypeScript rules (awsdesk-api)
- Strict mode on
- Module resolution: `NodeNext` — all imports must end in `.js` even for
  `.ts` source files (e.g. `import { foo } from './lib/aws.js'`)
- Target: ES2022

---

## API conventions

```
Base URL      /api/v1/
Auth          Cookie session — POST /api/v1/auth/login {username, password}
              All /api/v1/* routes (except /auth/*) require the session cookie

Read routes   GET /api/v1/accounts
              GET /api/v1/accounts/:accountId/ecs/services
              GET /api/v1/accounts/:accountId/rds/instances
              GET /api/v1/accounts/:accountId/cloudwatch/alarms
              GET /api/v1/accounts/:accountId/secrets
              GET /api/v1/accounts/:accountId/topology

Write routes  POST /api/v1/accounts/:accountId/jobs  (Phase 2+)
              → writes a job row, returns {jobId, status: 'planned', plan: {...}}
              → client shows diff preview, user confirms
              → PATCH /api/v1/jobs/:jobId/approve → async execution begins
```

Every mutating action (read or write) writes a row to `audit_log`.
Write operations always go through the `jobs` table — no fire-and-forget.

---

## AWS access model

```
Hub account
  IAM user: platform-svc
  Policy: read-only (see onboard-account.cfn.yaml for exact action list)
  Keys: in awsdesk-api .env only — never in the web repo, never committed

Spoke accounts
  IAM role: AWSDeskReadOnlyRole (deployed via onboard-account.cfn.yaml)
  Trust: allows hub platform-svc to AssumeRole with ExternalId
  Session: 15 minutes, auto-refreshed and cached in memory

getClient(accountId, service) flow:
  Hub account  → use env credentials directly
  Spoke account → sts:AssumeRole → cache 15-min session → return SDK client
```

**Deliberately NOT granted anywhere:** `secretsmanager:GetSecretValue`.
Secret values are never visible in the platform. Names and metadata only.

---

## Database schema (Neon — postgres database, port 6543 pooled)

```sql
accounts            id (AWS account id), name, environment, status
audit_log           append-only: actor, account_id, action, target, detail (jsonb), created_at
jobs                id, account_id, capability, spec (jsonb), plan (jsonb),
                    status (draft→planned→approved→running→verifying→done|failed),
                    error, created_by, created_at, updated_at
ip_groups           id, name, description  (e.g. 'SCB proxy IPs')
ip_group_entries    group_id, cidr, label, added_by, added_at
whitelist_attachments  account_id, api_id, api_name, stage, ip_group_ids[], direct_entries (jsonb)
policy_versions     attachment_id, rendered_policy (jsonb), applied_by, job_id, applied_at
```

`audit_log` is append-only — never UPDATE or DELETE rows from it.

---

## awsdesk-api .env (never needed in awsdesk-web)

```env
DATABASE_URL=            # Neon pooled connection string (port 6543)
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=       # platform-svc IAM user access key
AWS_SECRET_ACCESS_KEY=   # platform-svc IAM user secret
AWSDESK_HUB_ACCOUNT_ID= # hub AWS account id
AWSDESK_READ_ROLE=AWSDeskReadOnlyRole
AWSDESK_EXTERNAL_ID=     # random string matching spoke CFN ExternalId param
DASHBOARD_USERNAME=ramon
DASHBOARD_PASSWORD=      # any strong password
COOKIE_SECRET=           # openssl rand -hex 32
WEB_ORIGIN=http://localhost:5173
```

---

## Local dev

```bash
# Terminal 1 — API
cd awsdesk-api
npm install
npm run dev              # Fastify on :3000

# Terminal 2 — Web
cd awsdesk-web
npm install
npm run dev              # Vite on :5173, proxies /api → :3000

# Browser
open http://localhost:5173
# Login with DASHBOARD_USERNAME / DASHBOARD_PASSWORD from awsdesk-api .env
```

---

## Build phases — current status and what comes next

### ✅ Phase 1 — Read-only dashboard (BUILT)
- Login + cookie session
- Account switcher (reads `accounts` table, AssumeRole per spoke)
- ECS services, RDS instances, CloudWatch alarms, Secrets metadata
- Topology: VPC → subnets (public/private from route tables) →
  ENI-based node discovery (ECS, RDS, ALB, Lambda, EC2 with private IPs)
- Forward-looking schema: `jobs`, `ip_groups`, `policy_versions` already created

---

### 🔜 Phase 1.75 — Logs (NEXT)

**Goal:** Replace CloudWatch Logs console entirely.

#### API (awsdesk-api)
Add to `onboard-account.cfn.yaml` policy:
```
logs:StartLiveTail
logs:StartQuery
logs:StopQuery
logs:GetQueryResults
logs:FilterLogEvents
logs:DescribeLogGroups
logs:DescribeLogStreams
```

New routes:
```
GET  /api/v1/accounts/:accountId/logs/groups
     → ListLogGroups, return name + storedBytes + retentionDays

GET  /api/v1/accounts/:accountId/logs/tail?logGroupName=&filter=
     → Server-Sent Events (SSE): Content-Type: text/event-stream
     → calls StartLiveTail, streams events as:
       data: {"timestamp":"...","level":"INFO","message":"...","requestId":"..."}\n\n

POST /api/v1/accounts/:accountId/logs/query
     Body: { logGroupName, startTime, endTime, queryString, filter?, level? }
     → StartQuery → poll GetQueryResults → return rows
     (platform generates the Insights query syntax from the form inputs)

GET  /api/v1/accounts/:accountId/logs/metrics?logGroupName=&hours=3
     → GetMetricData for error rate + request volume → sparkline data
```

#### Web (awsdesk-web)
New "Logs" tab between CloudWatch and Secrets in the nav.

Layout:
```
┌─ Log group picker (dropdown, populated from /logs/groups) ──────────┐
│ [parkwise-api ▾]  [Live tail]  [Search]  ← two sub-tabs             │
├─────────────────────────────────────────────────────────────────────┤
│ Live tail sub-tab:                                                   │
│  Filter input (plain text, sent as filter param to SSE endpoint)    │
│  Log rows — monospace, level-colored:                                │
│    INFO  → #00C896    WARN  → #e8b339                               │
│    ERROR → #f5455c    DEBUG → #5a6577                               │
│  Timestamp in faint mono, message in normal mono                    │
│  Auto-scroll to bottom; pause-on-hover                              │
│                                                                      │
│ Search sub-tab:                                                      │
│  Time range picker (last 15m / 1h / 3h / 24h / custom)             │
│  Level filter (ALL / INFO / WARN / ERROR)                           │
│  Free-text search input                                              │
│  → platform generates CloudWatch Insights query from these inputs   │
│  Results table: timestamp | level | message | requestId             │
│  Error rate sparkline above results (from /logs/metrics)            │
└─────────────────────────────────────────────────────────────────────┘
```

SSE client pattern (EventSource):
```js
const es = new EventSource(
  `/api/v1/accounts/${accountId}/logs/tail?logGroupName=${group}&filter=${filter}`,
  { withCredentials: true }
);
es.onmessage = (e) => {
  const event = JSON.parse(e.data);
  setLines(prev => [...prev.slice(-500), event]); // keep last 500 lines
};
// cleanup
return () => es.close();
```

---

### 🔜 Phase 2 — Whitelist management (SCB-style API Gateway resource policies)

**Goal:** Never hand-edit a resource policy JSON blob again.

This is the first write capability. The UX must show a diff preview before
any change is applied — the user sees exactly which CIDRs are added/removed
and the rendered policy JSON before confirming.

#### New IAM role (deploy per spoke, separate from read role)
Role name: `AWSDeskWrite-ApiGatewayPolicy`
```json
{
  "Action": [
    "apigateway:PATCH",
    "apigateway:POST"
  ],
  "Resource": [
    "arn:aws:apigateway:*::/restapis/*",
    "arn:aws:apigateway:*::/restapis/*/deployments"
  ]
}
```
Trust: same hub platform-svc + ExternalId pattern as the read role.

#### API routes (awsdesk-api)
```
GET  /api/v1/accounts/:accountId/apigateway/apis
     → apigateway:GET /restapis — list all APIs with name, id, stage count

GET  /api/v1/accounts/:accountId/apigateway/:apiId/whitelist
     → parse live resource policy into { ipGroups[], directEntries[], version }

POST /api/v1/accounts/:accountId/apigateway/:apiId/whitelist/plan
     Body: { ipGroupIds[], directEntries[], stage }
     → renders new policy JSON from groups + entries
     → fetches live policy, computes diff (added[], removed[])
     → writes job row (status: 'planned')
     → returns { jobId, diff: { added[], removed[] }, renderedPolicy }
     (nothing written to AWS yet)

POST /api/v1/jobs/:jobId/approve
     → job status: planned → running
     → assumes AWSDeskWrite-ApiGatewayPolicy role
     → UpdateRestApiPolicy + CreateDeployment
     → re-fetches live policy to verify match
     → job status: done | failed
     → writes policy_versions row
     → writes audit_log row

GET  /api/v1/accounts/:accountId/apigateway/:apiId/whitelist/history
     → policy_versions for this attachment, newest first
     → each version has rendered_policy + applied_by + applied_at

POST /api/v1/accounts/:accountId/apigateway/:apiId/whitelist/rollback
     Body: { versionId }
     → creates a new plan job using the historical rendered_policy
     → same approve flow as normal apply
```

#### Policy renderer (src/lib/whitelist.ts)
```typescript
// builds the aws:SourceIp condition array from groups + direct entries
// called during /plan and /approve — single source of truth
function renderResourcePolicy(cidrs: string[]): object {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: "*",
        Action: "execute-api:Invoke",
        Resource: "arn:aws:execute-api:*:*:*/*/*/*",
        Condition: { IpAddress: { "aws:SourceIp": cidrs } },
      },
      {
        Effect: "Deny",
        Principal: "*",
        Action: "execute-api:Invoke",
        Resource: "arn:aws:execute-api:*:*:*/*/*/*",
        Condition: { NotIpAddress: { "aws:SourceIp": cidrs } },
      },
    ],
  };
}
```

Guardrails (validated before plan is created, return 400 if violated):
- 0.0.0.0/0 → blocked entirely
- /8 or larger → warn, require explicit confirmation flag in request body
- Empty CIDR list on an API that currently has a policy → blocked
  ("removing all IPs would open the API publicly")
- Invalid CIDR syntax → rejected with specific field error
- Overlap detection: flag if a /24 already covers a /32 being added

#### Web — Access Control tab
Appears between Secrets and Topology in the nav.

```
API list (cards, one per API gateway)
  Name + id + stage pills + whitelist count pill + status dot
  Click → detail view

Detail view tabs: Entries | History | Settings

Entries tab:
  IP Groups section
    Assigned groups as chips (e.g. "SCB proxy IPs · 54 CIDRs")
    [+ Assign group] → dropdown of available groups
  Direct entries section
    Table: CIDR | Label | Added by | Added
    [+ Add CIDR] → inline form with validation feedback
  [Preview changes] button → opens diff panel

Diff panel (before apply):
  Green rows: + CIDRs being added
  Red rows:   - CIDRs being removed
  Collapsible: rendered policy JSON
  [Apply to {stage}] → calls /approve on the job → progress toast

History tab:
  Reverse-chronological list of policy_versions
  Each row: timestamp | applied_by | CIDR count | [Rollback] button

Settings tab (danger zone):
  Remove all managed entries — requires typing API name to confirm
```

---

### 🔜 Phase 3 — Lambda creation

- Form: name, runtime (Node 22/24), memory, timeout, env vars, execution
  role picker, optional trigger (API Gateway route or EventBridge schedule)
- Execution via CloudFormation stack per resource (not raw SDK calls)
  — gives rollback, idempotency, stack-level deletion for free
- Async job: Vercel API writes job row → invoke a Lambda worker function
  in the hub account → worker runs CFN → polls until complete → updates job
- Topology: provisioning nodes appear as pulsing ghost nodes until confirmed
- New role per spoke: `AWSDeskWrite-Lambda`
  (lambda:CreateFunction, lambda:UpdateFunctionCode, iam:PassRole scoped to
  the platform's execution role only)

---

### 🔜 Phase 4 — API Gateway structural editor

- Visual resource tree (route hierarchy, not flat list)
- Add path, attach HTTP method, wire Lambda integration, deploy to stage
- REST convention validation — enforces Ramon's naming standards:
  capability-first hierarchy, lowercase kebab-case, versioned paths
  (e.g. rejects `/getUser`, requires `/users/{id}`)
- New role per spoke: `AWSDeskWrite-ApiGateway`

---

### 🔜 Phase 5 — ECS service creation, EC2 (template-only), RDS

- ECS: desired count, task definition picker, subnet + SG from topology
- EC2: template-only (limited instance types, approved AMIs, no free-form)
- RDS: engine, class, storage, subnet group — encryption on by default,
  public access blocked at validation layer

---

### 🔜 Phase 6 — Drift detection

- Nightly job: compare stored specs (jobs table, policy_versions) vs.
  live describe API responses
- Drift shown as amber nodes in topology view
- Audit log entry per drift event
- Dashboard "Drift" badge on affected account cards

---

## Architecture rules — never break these

1. **All AWS access through `getClient()` in `src/lib/aws.ts` only.**
   Never construct an SDK client in a route file or component.

2. **All writes go through the `jobs` table.**
   No fire-and-forget mutations. Every write has a plan → approve flow.

3. **`audit_log` is append-only.**
   Never UPDATE or DELETE rows. Every action (read and write) gets a row.

4. **`GetSecretValue` is never granted, never called.**
   Secret names and metadata only. Values never appear anywhere in the platform.

5. **Write IAM roles are per-capability and narrowly scoped.**
   `AWSDeskWrite-ApiGatewayPolicy` cannot touch Lambda. `AWSDeskWrite-Lambda`
   cannot touch API Gateway. Blast radius is always contained.

6. **0.0.0.0/0 is blocked at the validation layer.**
   Not just documented — the plan endpoint returns a 400 if it appears in any
   whitelist entry. Same for security group rules when those are added.

7. **All platform-created resources get mandatory tags.**
   `CreatedBy=awsdesk`, `Project={from form}`, `Owner={actor}`.
   The topology view uses `CreatedBy=awsdesk` to distinguish managed nodes
   (full edit controls) from pre-existing infrastructure (view-only).

8. **Ramon deploys. Never assume CI/CD push-to-deploy.**
   Don't add GitHub Actions workflows or modify `vercel.json` without asking.

---

## Useful commands

```bash
# Run schema against Neon (one-time setup or after schema changes)
psql "$DATABASE_URL" -f db/schema.sql

# Seed an account
psql "$DATABASE_URL" -c "
  insert into accounts (id, name, environment)
  values ('YOUR_ACCOUNT_ID', 'account-name', 'production')
  on conflict do nothing;
"

# Check what's in the audit log
psql "$DATABASE_URL" -c "
  select actor, action, target, created_at
  from audit_log order by created_at desc limit 20;
"

# Generate a cookie secret
openssl rand -hex 32

# Deploy (run from each repo root)
npm install && vercel --prod
```

---

## Contacts and related context

- Ramon's GitHub: `monmargarcia`
- Vercel username: `apibean`
- AWS region: `ap-southeast-1` (Singapore)
- Related projects in same stack: `parkwise-api`, `parkwise-web` (Fastify 5 +
  TypeScript + Neon + React 18 + Vite + Vercel — same patterns apply)
- Ramon is familiar with: MAS TRM guidelines, ICA, ACRA, NETS, SGX context
  (relevant if the platform is ever extended to compliance workflows)
