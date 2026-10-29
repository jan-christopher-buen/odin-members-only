import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { csrfSync } from "csrf-sync";
import { pool } from "./db/pool.js";
import { configurePassport } from "./auth/passport.js";
import { routes } from "./routes.js";
export function createApp({ limits } = {}) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw new Error("Set SESSION_SECRET to at least 32 random characters.");
  const app = express();
  const passport = configurePassport();
  const PgStore = connectPgSimple(session);
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY) {
    const trustedProxy = process.env.TRUST_PROXY.trim();
    // A hop count must match the host's documented proxy topology.
    app.set(
      "trust proxy",
      /^[1-9]\d*$/.test(trustedProxy)
        ? Number(trustedProxy)
        : trustedProxy.split(",").map((subnet) => subnet.trim()),
    );
  }
  app.set("view engine", "ejs");
  app.set("views", new URL("../views/", import.meta.url).pathname);
  app.use((_req, res, next) => {
    res.locals.user = undefined;
    res.locals.csrfToken = "";
    res.locals.notice = undefined;
    next();
  });
  app.use(helmet());
  app.use(express.static(new URL("../public/", import.meta.url).pathname));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  const store = new PgStore({ pool, createTableIfMissing: false });
  app.locals.sessionStore = store;
  app.use(
    session({
      name: "club.sid",
      secret: process.env.SESSION_SECRET,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
  const { generateToken, csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) => req.body?._csrf,
  });
  app.use((req, res, next) => {
    res.locals.user = req.user;
    res.locals.csrfToken = generateToken(req);
    res.locals.notice = undefined;
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(csrfSynchronisedProtection);
  app.use(routes(passport, limits));
  app.use((_req, res) =>
    res.status(404).render("error", {
      title: "Page not found",
      message: "This page does not exist. Return to the board to continue.",
    }),
  );
  app.use((error, _req, res, _next) => {
    const status =
      error.code === "EBADCSRFTOKEN"
        ? 403
        : error.status === 413
          ? 413
          : error.status === 400
            ? 400
            : 500;
    if (status === 500)
      console.error("Request failed:", error.code || error.name);
    res.status(status).render("error", {
      title:
        status === 403
          ? "Form expired"
          : status === 500
            ? "Something went wrong"
            : "Invalid request",
      message:
        status === 403
          ? "Refresh the page and submit the form again."
          : status === 500
            ? "We could not complete your request. Please try again later."
            : "The submitted request could not be processed.",
    });
  });
  return app;
}
