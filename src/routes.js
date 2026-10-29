import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as accounts from "./controllers/accounts.js";
import * as messages from "./controllers/messages.js";
import {
  signupRules,
  messageRules,
  loginRules,
  signedIn,
  adminOnly,
  validId,
} from "./middleware/validation.js";
export function routes(passport, limits = {}) {
  const router = Router();
  const limiter = (limit) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).render("error", {
          title: "Too many attempts",
          message: "Please wait 15 minutes before trying again.",
        }),
    });
  const signupLimit = limiter(limits.signup ?? 10),
    loginLimit = limiter(limits.login ?? 20),
    passcodeLimit = limiter(limits.passcode ?? 10);
  router.get("/", messages.index);
  for (const kind of ["signup", "login"])
    router.get("/" + kind, (req, res) =>
      accounts.form(kind, req, res, {
        notice:
          kind === "login" && req.query.registered === "1"
            ? "Account created. You can now log in."
            : undefined,
      }),
    );
  router.post("/signup", signupLimit, signupRules, accounts.signup);
  router.post("/login", loginLimit, loginRules, accounts.login(passport));
  router.post("/logout", signedIn, accounts.logout);
  for (const kind of ["membership", "admin"]) {
    router.get("/" + kind, signedIn, (req, res) =>
      accounts.form(kind, req, res),
    );
    router.post("/" + kind, signedIn, passcodeLimit, accounts.passcode);
  }
  router.get("/messages/new", signedIn, (req, res) =>
    accounts.form("message", req, res),
  );
  router.post("/messages", signedIn, messageRules, messages.create);
  router.get(
    "/messages/:id/delete",
    signedIn,
    adminOnly,
    validId,
    messages.confirm,
  );
  router.post(
    "/messages/:id/delete",
    signedIn,
    adminOnly,
    validId,
    messages.remove,
  );
  return router;
}
