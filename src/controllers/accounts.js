import bcrypt from "bcryptjs";
import { createUser, grant } from "../db/queries.js";
import { errors } from "../middleware/validation.js";
export const form = (kind, req, res, extra = {}) =>
  res.render("form", {
    title: {
      signup: "Create your account",
      login: "Welcome back",
      membership: "Join the club",
      admin: "Administrator access",
      message: "Write a message",
    }[kind],
    kind,
    values: {},
    errors: {},
    ...extra,
  });
export async function signup(req, res) {
  const issues = errors(req);
  const values = Object.fromEntries(
    ["firstName", "lastName", "username"].map((k) => [
      k,
      typeof req.body[k] === "string" ? req.body[k] : "",
    ]),
  );
  if (Object.keys(issues).length)
    return form("signup", req, res.status(400), { values, errors: issues });
  try {
    await createUser(values, await bcrypt.hash(req.body.password, 12));
  } catch (error) {
    if (error.code !== "23505") throw error;
    return form("signup", req, res.status(400), {
      values,
      errors: { username: "That username is already taken." },
    });
  }
  res.redirect("/login?registered=1");
}
export function login(passport) {
  return (req, res, next) => {
    const failure = () =>
      form("login", req, res.status(401), {
        values: {
          username:
            typeof req.body.username === "string" ? req.body.username : "",
        },
        errors: { form: "Invalid username or password." },
      });
    if (Object.keys(errors(req)).length) return failure();
    passport.authenticate("local", (error, user) => {
      if (error) return next(error);
      if (!user) return failure();
      req.logIn(user, (error) => (error ? next(error) : res.redirect("/")));
    })(req, res, next);
  };
}
export function logout(req, res, next) {
  req.logout((error) => {
    if (error) return next(error);
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie("club.sid", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      res.redirect("/");
    });
  });
}
export async function passcode(req, res) {
  const admin = req.path === "/admin";
  const kind = admin ? "admin" : "membership";
  if (admin ? req.user.is_admin : req.user.is_member)
    return form(kind, req, res, {
      notice: "Your account already has this access.",
    });
  const expected = admin
    ? process.env.ADMIN_PASSCODE
    : process.env.MEMBERSHIP_PASSCODE;
  if (
    !expected ||
    typeof req.body.passcode !== "string" ||
    req.body.passcode !== expected
  )
    return form(kind, req, res.status(403), {
      errors: {
        passcode:
          "Unable to grant access. Check the passcode or contact the site owner.",
      },
    });
  await grant(req.user.id, admin);
  res.redirect("/");
}
