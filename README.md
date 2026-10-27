# Education Management Portal

A teaching and course-selection portal for Malaysia-based tuition and enrichment centres. The current workflow is **local editing → local running → local verification**. GitHub publishing and Cloudflare deployment are separate actions.

## Start the local app

Use Node.js **22.13.0 or newer**, then run these commands from the repository directory:

```bash
npm install
npm run dev:local
```

Open **http://localhost:3100**. On a new local database, the first visit asks you to create the administrator account. Use your own name, email and password; there is no shared default administrator password. Student self-registration is available at `/register`.

`dev:local` checks that port 3100 is free, applies local migrations, prepares required reference data and starts the app on `127.0.0.1:3100`. Stop an existing local server before restarting this command. Press Ctrl+C in its terminal to stop it.

Local records live under `.wrangler/state`. Startup preserves existing students, teachers, classes and payments. It does not generate demo people, classes or bills. A database that already contains earlier sample records keeps those records.

The local startup, test and local build commands do not push to GitHub, deploy a Worker or migrate the remote Cloudflare database. The first-administrator setup on a non-loopback host additionally requires the server-only `PORTAL_BOOTSTRAP_SECRET`.

## Daily operating workflow

### 1. Admissions and membership

In **Admissions & membership**:

1. Complete the student and guardian information, including school system and year.
2. Review the registration and accept it when ready.
3. Enter the membership fee agreed for that student. Membership pricing is configured by the administrator.
4. Confirm the membership payment after the money has actually arrived. A zero-fee membership needs an explicit waiver reason.
5. View the membership receipt and admission ticket.

Membership admission and course tickets are separate. Paying membership does not silently purchase course tickets. Use **Edit full profile** to update school year, contacts and guardian details without changing the application or membership status. Changing the student's email also changes their sign-in email.

G6 access to secondary courses is limited to the administrator's course whitelist in **Course access rules**.

### 2. Arrange the first month

In **Plans & billing → Arrange first month**:

1. Choose the student, an open course class and the first service month.
2. Enter the exact onsite, online and study ticket quantities.
3. Review the suggested fee. Initial unit prices are onsite **RM 20**, online **RM 10**, and study **RM 10**. For example, `4 × 20 + 6 × 10 + 2 × 10 = RM 160`.
4. Enter a different final fee when a discount or free month is approved, and record the reason. The final fee follows the suggestion until it is edited. **Use suggested fee** restores automatic calculation. There is no automatic half-price rule based on the joining date.
5. Select the specific first-month lessons to reserve. The number selected cannot exceed the corresponding ticket allowance. All lessons may be left unselected to issue tickets without a first-month lesson reservation; the total ticket allowance must be greater than zero.
6. Decide whether to reserve the remaining course in later months. Each later month has its own bill. The standard full-month package is **4 onsite + 6 online + 2 study tickets at RM 160**. A month with additional course lessons shows its extra charge and requires explicit approval; for example, five onsite lessons cost RM 180 at the initial unit prices. You can turn off later-month reservations and arrange only the first month.
7. Set the first-month payment deadline, or leave it blank while awaiting campus confirmation, then save the arrangement.

Saving the plan creates the agreed bill. **Payment or the approved fee waiver is confirmed separately.** First-month ticket unit prices can be changed in **Payment settings**. Existing sold bills retain their recorded terms.

### 3. Record actual money received

In **Plans & billing → Bills & receipts**, select the bill and review its original amount, agreed amount and deadline.

After checking the actual bank, wallet or cash record, enter the payment method, amount received, received date/time and transaction reference. Confirm that the money has arrived before saving. A transfer instruction or a screenshot alone is not receipt of money. An approved RM 0 bill uses the separate fee-waiver confirmation.

The receipt preview contains the bill reference, student, service month, agreed price, received amount, payment method and reference. It can be printed or saved as a PDF. **Payments** and **Reports** combine course, package and membership records; membership amounts stored in cents are converted to RM for display.

Bank-account and wallet instructions shown to students are maintained in **Payment settings**.

### 4. Natural-month validity and payment deadlines

First-month and normal monthly-package tickets belong to their stated **calendar month**, using Malaysia campus time. Unused monthly tickets expire at month-end. They do not roll into the next month or receive an automatic refund. Student leave does not automatically extend the ticket period. Campus-approved replacement lessons are handled separately.

The monthly payment due day is administrator-configured; there is no fixed 7th or 10th imposed by the app. When the due day exceeds the length of a month, that month's last day is used. Existing bills keep their recorded deadlines.

- **No deadline set:** the bill waits for the campus to assign a date; its reservations are not automatically released for overdue payment.
- **Deadline set and passed:** future unpaid reservations linked to that bill can be released. Paid reservations remain confirmed.
- **Approved extension:** change the deadline in **Reserved lessons** before release, with a reason.
- **Manual release:** review and release an unpaid bill's reservations, or run the overdue-reservation check explicitly.

Overdue checks run when the portal data is requested. An open, visible portal refreshes approximately every 60 seconds while idle. This is not a background scheduler: if the local service is stopped or nobody is accessing it, overdue processing resumes on the next portal request. Previously released seats are checked again when payment is confirmed and may no longer be available.

### 5. Lesson changes and campus replacements

In **Plans & billing → Lesson changes**:

- For a campus cancellation, cancel the original lesson in the timetable first. Schedule and publish the replacement lesson for the same course, then select the eligible affected learners. Each selected learner receives a linked replacement lesson entitlement, including an approved replacement in a later month. Learners who had personally withdrawn before the campus cancelled are not automatically included.
- For a single learner's onsite/online change, select the future booked lesson and explicitly choose how its ticket is treated: retain the original funding, exchange it for one valid target-mode ticket, or grant one approved campus replacement ticket. Record the reason. A directly paid course retains its existing course funding.

Students can view their pending first-month arrangement, bills, payment instructions, receipts, reservation status and replacement lessons in their own portal.

## Verification and data separation

```bash
npm run typecheck
npm test
npm run lint
npm run build:local
```

`build:local` runs type checking, automated tests and a local production build. `npm run build` is also mapped to this local build workflow.

Automated business tests use in-memory SQLite fixtures or temporary test directories, independently of `.wrangler/state`. They cover registration and membership, role isolation, first-month quotas and pricing, payment retries and rollback, monthly expiry, seat release, replacement lessons, timetable conflicts and financial aggregation. Browser checks against the normal local app use that app's actual local records; use a separate QA state directory for disposable scenarios.

To prepare an isolated local database for migration/initialization checks:

```bash
node scripts/prepare-local-db.mjs --persist-to .wrangler/qa-state
```

This prepares the named QA database; it does not switch the normal `dev:local` app away from `.wrangler/state`. Back up local data before replacing a working state directory. Do not copy test learners, receipts or reservations into the operating database.

Useful local commands:

```bash
npm run dev:local          # migrate/initialize local state, then start on 3100
npm run db:migrate:local   # migrate and initialize local state without starting
npm run typecheck         # TypeScript verification
npm test                  # isolated automated regression tests
npm run lint              # source lint checks
npm run build:local       # local verification and production build
npm run db:generate       # generate a migration after schema changes
```

## Architecture and optional services

- Next.js-style app routes through `vinext`
- Cloudflare D1 binding `DB`, with local SQLite state for development
- Drizzle migration files in `drizzle/`
- Static images and frontend assets served by the Worker assets binding
- Cookie sessions with server-side role and record checks

Teacher qualification, course approval and availability feed the classroom timetable. Monthly previews support explicit date exclusions, conflict checks, draft creation and publication.

Welcome emails remain queued until a server mail provider is configured. The server-only HTTPS `PORTAL_MAIL_WEBHOOK_URL` and optional `PORTAL_MAIL_WEBHOOK_TOKEN` configure delivery. The webhook receives `{id,to,subject,text}` and must deduplicate by `id`. Unconfigured delivery stays pending; failed delivery can be retried from the admissions workspace.

## Cloudflare deployment — separate from local operation

Deployment needs a Cloudflare account, the target D1 database and an explicit decision to publish. No deployment or GitHub publishing is performed by the local workflow above.

The intended D1 database name is `education-management-db`, bound as `DB` in `wrangler.jsonc`. The deployment preparation script can resolve its real database ID. If automatic lookup is unavailable, configure `CLOUDFLARE_D1_DATABASE_ID`; account/API access may also require `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Do not replace the database ID with a placeholder.

Explicit deployment commands:

```bash
npm run build:deploy       # deployment-oriented build and configured migration step
npm run db:migrate:remote  # apply migrations to the remote D1 database
npm run cf:deploy          # deployment build, remote migrations and Worker upload
```

The migration script inside `build:deploy` only applies remote migrations in an allowed Cloudflare production-build context or with the explicit `APPLY_REMOTE_MIGRATIONS=1` override. `APPLY_REMOTE_MIGRATIONS=0` disables that script's automatic step. `cf:deploy` additionally invokes the explicit remote-migration command.

Review the Cloudflare/GitHub deployment configuration before enabling a production pipeline. Git pushes and remote database changes are outside the current local delivery workflow.
