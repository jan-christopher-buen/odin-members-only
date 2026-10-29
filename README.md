# Members Only

A clubhouse message board built for [The Odin Project’s Members Only assignment](https://www.theodinproject.com/lessons/node-path-nodejs-members-only). Everyone can read the stories; membership reveals the people behind them.

Express 5, EJS, responsive plain CSS, PostgreSQL (`pg`), Passport Local, `express-session`, `connect-pg-simple`, asynchronous `bcryptjs`, and `express-validator`. Session-based CSRF protection uses `csrf-sync`; `express-rate-limit` limits authentication and passcode attempts. Helmet supplies security headers.

## Run locally

Requires Node.js 24+, npm, and PostgreSQL. On Ubuntu/WSL, the example uses local peer authentication for role `jc` through `/var/run/postgresql`. Use your own PostgreSQL role on other systems.

```sh
npm ci
cp .env.example .env
createdb odin_members_only
createdb odin_members_only_test
```

Create databases only if they do not exist. Edit the ignored `.env` privately:

| Variable              | Purpose                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `PGHOST`              | Local socket directory, e.g. `/var/run/postgresql`, or database host          |
| `PGPORT`              | PostgreSQL port, normally `5432`                                              |
| `PGUSER`              | Your PostgreSQL role                                                          |
| `PGPASSWORD`          | Password if the connection requires one; omit for peer authentication         |
| `PGDATABASE`          | Application database: `odin_members_only`                                     |
| `DATABASE_URL`        | Hosted connection URL; takes precedence over PG settings                      |
| `PORT`                | HTTP port; defaults to `3000`                                                 |
| `SESSION_SECRET`      | At least 32 random characters; generate privately with `openssl rand -hex 32` |
| `MEMBERSHIP_PASSCODE` | Private membership invitation                                                 |
| `ADMIN_PASSCODE`      | Separate private administrator invitation                                     |
| `NODE_ENV`            | Set to `production` behind HTTPS; enables Secure cookies                      |
| `TRUST_PROXY`         | Optional comma-separated trusted proxy IPs/subnets; unset locally             |

Do not commit `.env`. Missing passcodes disable their respective grants. Production uses provider-injected variables without requiring an environment file. Follow your database provider’s TLS configuration; do not disable certificate verification.

```sh
npm run db:setup
npm start
# http://localhost:3000
```

`npm run dev` enables Node’s watcher. `db:setup` creates tables/indexes in a transaction and can be rerun without deleting data. It is an explicit command, never part of startup or a build. It does not migrate incompatible existing schemas. `npm run db:seed` is an optional, intentional no-op: no sample accounts, default passwords, or privileged users are shipped. Sign up normally to add an account.

## Permissions and routes

| Action                                                   | Visitor | Nonmember | Member         | Admin          |
| -------------------------------------------------------- | ------- | --------- | -------------- | -------------- |
| Read titles and bodies (`GET /`)                         | Yes     | Yes       | Yes            | Yes            |
| See authors and dates                                    | No      | No        | Yes            | Yes            |
| Write (`GET /messages/new`, `POST /messages`)            | No      | Yes       | Yes            | Yes            |
| Join with invitation (`GET/POST /membership`)            | No      | Yes       | Already joined | Already joined |
| Claim admin with separate invitation (`GET/POST /admin`) | No      | Yes       | Yes            | Already admin  |
| Confirm/delete (`GET/POST /messages/:id/delete`)         | No      | No        | No             | Yes            |

`GET/POST /signup` creates only nonmember, nonadmin accounts and redirects to login. `GET/POST /login` establishes a Passport session; `POST /logout` logs out and destroys it. All state-changing forms require a CSRF token. Authentication, membership, and administration are checked separately on the server. Admin invitations also grant membership. Only admins see deletion controls, followed by a separate confirmation page.

Usernames use 3–30 ASCII letters, digits, underscores, and hyphens, with case-insensitive uniqueness. Personal names accept Unicode, spaces, apostrophes, and hyphens (1–80 characters). Passwords are never trimmed: at least 8 characters and at most 72 UTF-8 bytes, hashed asynchronously at bcrypt cost 12. Titles allow 1–120 characters, bodies 1–5000. Text renders escaped and preserves message line breaks.

## Data and sessions

`users` stores generated IDs, names, unique usernames, password hashes, and two default-false permission flags. `messages` stores generated IDs, required author foreign keys, title/body, and a timestamp with time zone. The explicit `session` table stores PostgreSQL-backed Passport sessions with a seven-day cookie expiration. Only user IDs are serialized; current permissions reload from PostgreSQL on each request. Public message queries omit author/date fields entirely. Password hashes and session objects are never passed to views.

The app uses one shared pool and parameterized user values. Setup transactions use one checked-out client. Database failures produce a generic error page rather than fabricated data.

## Quality checks

```sh
npm test
npm run check
npm run format:check
npm run format
```

Tests use Node’s runner, Supertest, and real PostgreSQL. They refuse hosted URLs or any target other than local `odin_members_only_test`, verify `current_database()`, and clear only that test database’s tables before and after the suite. Do not use the test database for anything you need to keep. Tests deliberately ignore `.env`; the local `jc` role must have peer access. The suite checks validation, bcrypt storage, duplicate conflicts, permissions, response privacy, session reuse after app recreation, cookies, CSRF, rate limits, safe setup/seed, and escaped text.

## Limitations

Authentication rate limits are per IP per process (signup 10, login 20, shared passcodes 10 attempts per 15 minutes). They reset on restart and are intended for a single instance; multiple instances require a shared limiter store. There is no password recovery, editing, or account management. The board shows all messages without pagination, suitable for a small curriculum project.

Proxy trust defaults to off. Before enabling it, verify the actual proxy topology and header replacement behavior using the [official Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/). Do not blindly enable all forwarded headers. HTTPS is required for production sessions. There is no hosted deployment yet.

## Project structure

```text
src/auth/          Passport strategy and serialization
src/controllers/   Account and message handlers
src/db/            Shared pool, queries, explicit schema
src/middleware/    Validation and authorization
src/routes.js      Focused routes and attempt limits
src/app.js         Middleware composition and error handling
src/server.js      HTTP entry point
views/             EJS pages and trusted partials
public/            CSS and favicon
scripts/           Database setup, optional seed, syntax checks
tests/             Isolated PostgreSQL integration suite
```
