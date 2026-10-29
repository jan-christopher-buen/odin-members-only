# Members Only

A clubhouse message board built for [The Odin Project’s Members Only assignment](https://www.theodinproject.com/lessons/node-path-nodejs-members-only). Everyone can read the stories; membership reveals the people behind them.

Express 5, EJS, responsive plain CSS, PostgreSQL (`pg`), Passport Local, `express-session`, `connect-pg-simple`, asynchronous `bcryptjs`, and `express-validator`. Session-based CSRF protection uses `csrf-sync`; `express-rate-limit` limits authentication and passcode attempts. Helmet supplies security headers.

## Run locally

Requires Node.js 24.x, npm, and PostgreSQL. On Ubuntu/WSL, the example uses local peer authentication for role `jc` through `/var/run/postgresql`. Use your own PostgreSQL role on other systems.

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
| `TRUST_PROXY`         | Trusted proxy hop count or comma-separated IPs/subnets; unset locally         |

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

Proxy trust defaults to off. Before enabling it, verify the actual proxy topology and header replacement behavior using the [official Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/). Do not blindly enable all forwarded headers. HTTPS is required for production sessions. There is no verified live deployment yet.

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

## Deploy to Render with Neon

Use a new **Free** Render Web Service and a dedicated **Free** Neon project for this app. Keep other projects’ resources separate. Both providers offer Singapore regions. Never run the integration suite against the hosted database.

1. Create the dedicated Neon project with database `odin_members_only`. Initialize `src/db/schema.sql` through its SQL editor before creating the Render service, or run `npm run db:setup` separately with its private direct connection URL. Do not put schema setup in the build/start command.
2. Push this repository normally to GitHub. In Render, create a new Blueprint from this repository’s `main` branch and `render.yaml`. Confirm the service’s plan is **Free**.
3. Enter the dedicated Neon **pooled** connection URL privately as `DATABASE_URL`, retaining its TLS parameters. Set separate membership and admin passcodes in Render. The Blueprint generates a session secret. None of these values belong in Git.
4. The Blueprint installs with `npm ci --omit=dev` and runs `npm start`. Node is limited to major 24. Render provides `PORT`; leave the local PG/socket settings out of Render. `NODE_ENV=production` enables Secure cookies.
5. `TRUST_PROXY=1` follows [Render’s documented Express proxy configuration](https://render.com/articles/how-render-handles-ddos-attacks). Verify secure cookies, form submission, and client-IP rate limiting on the deployed service before sharing it. Recheck the hop count if adding a custom CDN or changing the network path.
6. Verify signup, login, posting, membership, admin deletion, logout, privacy, and persistence through a service restart. Record the live URL only after it works. Automatic deployment is initially off; use Render’s manual deployment action for subsequent commits.

[Render Free](https://render.com/docs/free) services sleep after 15 minutes without inbound traffic and have shared monthly usage limits. [Neon Free](https://neon.com/pricing) also has usage limits and cold starts. Keep the service on Free and do not add paid resources or upgrade either plan.
