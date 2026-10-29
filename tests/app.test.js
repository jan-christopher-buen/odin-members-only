import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";

// Never read .env here. Refuse any hosted or unexpected database configuration.
if (
  process.env.DATABASE_URL ||
  (process.env.PGDATABASE &&
    process.env.PGDATABASE !== "odin_members_only_test") ||
  (process.env.PGHOST && process.env.PGHOST !== "/var/run/postgresql") ||
  (process.env.PGPORT && process.env.PGPORT !== "5432")
)
  throw new Error(
    "Tests require only the local odin_members_only_test database.",
  );
Object.assign(process.env, {
  PGHOST: "/var/run/postgresql",
  PGPORT: "5432",
  PGDATABASE: "odin_members_only_test",
  PGUSER: "jc",
  SESSION_SECRET: "test-only-session-secret-at-least-32-characters",
  MEMBERSHIP_PASSCODE: "test-member-invitation",
  ADMIN_PASSCODE: "test-admin-invitation",
  NODE_ENV: "test",
});
delete process.env.TRUST_PROXY;
const { pool } = await import("../src/db/pool.js");
const { setup } = await import("../scripts/setup.js");
const { createApp } = await import("../src/app.js");
const stores = [];
function app(options) {
  const instance = createApp(options);
  stores.push(instance.locals.sessionStore);
  return instance;
}
let site, alice, bob, aliceId, bobId, messageId;
let testDatabaseVerified = false;
const password = "temporary-test-password";
const token = (res) => {
  const value = res.text.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(value, "CSRF form token present");
  return value[1];
};
async function post(agent, path, data = {}, formPath = path) {
  const page = await agent.get(formPath);
  return agent
    .post(path)
    .type("form")
    .send({ ...data, _csrf: token(page) });
}
const signup = (username = "alice") => ({
  firstName: "Élodie O'Neil",
  lastName: "Dela Cruz-Santos",
  username,
  password,
  confirmPassword: password,
});
before(async () => {
  assert.equal(
    (await pool.query("SELECT current_database() AS db")).rows[0].db,
    "odin_members_only_test",
  );
  testDatabaseVerified = true;
  await setup();
  await setup();
  await pool.query("TRUNCATE messages, users, session RESTART IDENTITY");
  site = app();
  alice = request.agent(site);
  bob = request.agent(site);
});
after(async () => {
  for (const store of stores) store.close();
  if (testDatabaseVerified)
    await pool.query("TRUNCATE messages, users, session RESTART IDENTITY");
  await pool.end();
});

test("signup validates, hashes asynchronously, ignores forged roles and catches duplicate conflicts", async () => {
  assert.equal(
    (await post(alice, "/signup", { ...signup(), confirmPassword: "wrong" }))
      .status,
    400,
  );
  assert.equal(
    (
      await post(alice, "/signup", {
        ...signup(),
        password: "é".repeat(37),
        confirmPassword: "é".repeat(37),
      })
    ).status,
    400,
  );
  assert.equal(
    (await post(alice, "/signup", { ...signup(), firstName: ["bad", "type"] }))
      .status,
    400,
  );
  assert.equal(
    (await pool.query("SELECT count(*) FROM users")).rows[0].count,
    "0",
  );
  assert.equal(
    (
      await post(alice, "/signup", {
        ...signup(),
        is_admin: "true",
        is_member: "true",
      })
    ).status,
    302,
  );
  const user = (await pool.query("SELECT * FROM users")).rows[0];
  aliceId = user.id;
  assert.equal(user.is_admin, false);
  assert.equal(user.is_member, false);
  assert.notEqual(user.password_hash, password);
  assert.ok(await bcrypt.compare(password, user.password_hash));
  assert.equal(bcrypt.getRounds(user.password_hash), 12);
  const duplicate = await post(bob, "/signup", signup("ALICE"));
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.text, /already taken/);
  assert.ok(!duplicate.text.includes(password));
  const a = request.agent(site),
    b = request.agent(site);
  const results = await Promise.all([
    post(a, "/signup", signup("racer")),
    post(b, "/signup", signup("RACER")),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [302, 400]);
  assert.equal((await post(bob, "/signup", signup("bob"))).status, 302);
  bobId = (await pool.query("SELECT id FROM users WHERE username='bob'"))
    .rows[0].id;
});

test("login uses generic failures and persistent finite HttpOnly SameSite sessions", async () => {
  const fail = await post(alice, "/login", {
    username: "alice",
    password: "incorrect",
  });
  assert.equal(fail.status, 401);
  assert.match(fail.text, /Invalid username or password/);
  assert.ok(!fail.text.includes("incorrect"));
  const ok = await post(alice, "/login", { username: "ALICE", password });
  assert.equal(ok.status, 302);
  const cookie = ok.headers["set-cookie"].find((c) =>
    c.startsWith("club.sid="),
  );
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Expires=/);
  assert.ok(!cookie.includes("Secure"));
  const restarted = app();
  const page = await request(restarted)
    .get("/")
    .set("Cookie", cookie.split(";")[0]);
  assert.match(page.text, /Nonmember/);
  assert.ok(
    (
      await pool.query(
        "SELECT count(*) FROM session WHERE sess::text LIKE $1",
        ["%passport%"],
      )
    ).rows[0].count > 0,
  );
  assert.equal(
    (await post(bob, "/login", { username: "bob", password })).status,
    302,
  );
});

test("creation is authenticated, validated, escaped and cannot forge authorship; public HTML excludes metadata", async () => {
  const anonymous = request.agent(site);
  assert.equal((await anonymous.get("/messages/new")).status, 401);
  assert.equal(
    (await post(anonymous, "/messages", { title: "No", body: "No" }, "/signup"))
      .status,
    401,
  );
  assert.equal(
    (
      await post(
        alice,
        "/messages",
        { title: " ", body: "bad" },
        "/messages/new",
      )
    ).status,
    400,
  );
  assert.equal(
    (await pool.query("SELECT count(*) FROM messages")).rows[0].count,
    "0",
  );
  assert.equal(
    (
      await post(
        alice,
        "/messages",
        {
          title: "<script>alert(1)</script>",
          body: "A thought\n<img src=x onerror=alert(1)>",
          author_id: bobId,
        },
        "/messages/new",
      )
    ).status,
    302,
  );
  const row = (await pool.query("SELECT * FROM messages")).rows[0];
  messageId = row.id;
  assert.equal(row.author_id, aliceId);
  for (const agent of [anonymous, alice, bob]) {
    const page = await agent.get("/");
    assert.equal(page.status, 200);
    assert.ok(!page.text.includes("Élodie"));
    assert.ok(!page.text.includes("Dela Cruz-Santos"));
    assert.ok(!page.text.includes("<time"));
    assert.ok(!page.text.includes(row.created_at.toISOString()));
    assert.match(page.text, /&lt;script&gt;/);
    assert.ok(!page.text.includes("<img src=x"));
  }
});

test("passcodes fail closed, grant distinct permissions, and database permission changes refresh", async () => {
  assert.equal(
    (await post(alice, "/membership", { passcode: "wrong" })).status,
    403,
  );
  assert.equal((await post(alice, "/membership", {})).status, 403);
  assert.equal(
    (
      await post(alice, "/membership", {
        passcode: process.env.MEMBERSHIP_PASSCODE,
      })
    ).status,
    302,
  );
  let page = await alice.get("/");
  assert.match(page.text, /Élodie/);
  assert.match(page.text, /<time/);
  assert.equal(
    (await post(alice, "/membership", { passcode: "wrong" })).status,
    200,
  );
  assert.equal(
    (await post(alice, "/admin", { passcode: process.env.MEMBERSHIP_PASSCODE }))
      .status,
    403,
  );
  const saved = process.env.ADMIN_PASSCODE;
  delete process.env.ADMIN_PASSCODE;
  assert.equal((await post(alice, "/admin", { passcode: "" })).status, 403);
  process.env.ADMIN_PASSCODE = saved;
  await pool.query("UPDATE users SET is_member=false WHERE id=$1", [aliceId]);
  page = await alice.get("/");
  assert.ok(!page.text.includes("<time"));
  assert.equal((await post(alice, "/admin", { passcode: saved })).status, 302);
  const user = (
    await pool.query("SELECT is_member,is_admin FROM users WHERE id=$1", [
      aliceId,
    ])
  ).rows[0];
  assert.deepEqual(user, { is_member: true, is_admin: true });
  page = await alice.get("/");
  assert.match(page.text, /Admin/);
  assert.ok(!page.text.includes(saved));
});

test("deletion is protected on GET and POST; invalid/missing IDs and unknown routes are helpful", async () => {
  assert.equal((await bob.get(`/messages/${messageId}/delete`)).status, 403);
  assert.equal(
    (await post(bob, `/messages/${messageId}/delete`, {}, "/membership"))
      .status,
    403,
  );
  for (const id of ["bad", "0", "9999999999", "2147483647"]) {
    assert.equal((await alice.get(`/messages/${id}/delete`)).status, 404);
    assert.equal(
      (await post(alice, `/messages/${id}/delete`, {}, "/admin")).status,
      404,
    );
  }
  assert.equal((await alice.get(`/messages/${messageId}/delete`)).status, 200);
  assert.equal(
    (await post(alice, `/messages/${messageId}/delete`)).status,
    302,
  );
  assert.equal(
    (await pool.query("SELECT count(*) FROM messages")).rows[0].count,
    "0",
  );
  assert.equal((await alice.get("/unknown")).status, 404);
});

test("CSRF rejects mutations, logout destroys stored session and cookie", async () => {
  assert.equal((await alice.post("/logout")).status, 403);
  assert.equal(
    (
      await alice
        .post("/messages")
        .type("form")
        .send({ _csrf: "forged", title: "no", body: "no" })
    ).status,
    403,
  );
  const response = await post(alice, "/logout", {}, "/admin");
  assert.equal(response.status, 302);
  assert.match(
    response.headers["set-cookie"].join(";"),
    /Expires=Thu, 01 Jan 1970/,
  );
  assert.equal((await alice.get("/messages/new")).status, 401);
});

test("rate limits apply independently to signup, login and shared passcode attempts", async () => {
  const limited = app({ limits: { login: 1, signup: 1, passcode: 1 } });
  const agent = request.agent(limited);
  assert.equal(
    (await post(agent, "/login", { username: "bob", password })).status,
    302,
  );
  assert.equal(
    (await post(agent, "/login", { username: "bob", password })).status,
    429,
  );
  assert.equal(
    (await post(agent, "/membership", { passcode: "wrong" })).status,
    403,
  );
  assert.equal(
    (await post(agent, "/admin", { passcode: "wrong" })).status,
    429,
  );
  assert.equal(
    (
      await post(agent, "/signup", {
        ...signup("ratelimited"),
        confirmPassword: "bad",
      })
    ).status,
    400,
  );
  assert.equal(
    (await post(agent, "/signup", signup("ratelimited"))).status,
    429,
  );
});

test("production secure cookie policy requires HTTPS; setup and seed preserve user data", async () => {
  process.env.NODE_ENV = "production";
  const production = app();
  const response = await request(production).get("/signup");
  assert.equal(response.status, 200);
  assert.equal(response.headers["set-cookie"], undefined);
  process.env.TRUST_PROXY = "loopback";
  const proxyApp = app();
  const https = await request(proxyApp)
    .get("/signup")
    .set("X-Forwarded-Proto", "https");
  assert.match(https.headers["set-cookie"].join(";"), /Secure/);
  process.env.NODE_ENV = "test";
  delete process.env.TRUST_PROXY;
  const count = (await pool.query("SELECT count(*) FROM users")).rows[0].count;
  await setup();
  execFileSync(process.execPath, ["scripts/seed.js"]);
  execFileSync(process.execPath, ["scripts/seed.js"]);
  assert.equal(
    (await pool.query("SELECT count(*) FROM users")).rows[0].count,
    count,
  );
  assert.equal((await request(site).get("/style.css")).status, 200);
  assert.equal((await request(site).get("/favicon.svg")).status, 200);
});
