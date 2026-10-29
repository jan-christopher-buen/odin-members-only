import { body, validationResult } from "express-validator";
export const signupRules = [
  ...["firstName", "lastName"].map((name) =>
    body(name)
      .isString()
      .bail()
      .trim()
      .isLength({ min: 1, max: 80 })
      .withMessage("Use 1–80 characters."),
  ),
  body("username")
    .isString()
    .bail()
    .trim()
    .matches(/^[A-Za-z0-9_-]{3,30}$/)
    .withMessage("Use 3–30 ASCII letters, digits, underscores or hyphens."),
  body("password")
    .isString()
    .bail()
    .custom(
      (value) => value.length >= 8 && Buffer.byteLength(value, "utf8") <= 72,
    )
    .withMessage("Use at least 8 characters and no more than 72 UTF-8 bytes."),
  body("confirmPassword")
    .isString()
    .bail()
    .custom((value, { req }) => value === req.body.password)
    .withMessage("Passwords must match."),
];
export const messageRules = ["title", "body"].map((name) =>
  body(name)
    .isString()
    .bail()
    .trim()
    .isLength({ min: 1, max: name === "title" ? 120 : 5000 })
    .withMessage(
      name === "title" ? "Use 1–120 characters." : "Use 1–5000 characters.",
    ),
);
export const loginRules = [
  body("username")
    .isString()
    .bail()
    .trim()
    .matches(/^[A-Za-z0-9_-]{3,30}$/),
  body("password")
    .isString()
    .bail()
    .custom(
      (value) => value.length > 0 && Buffer.byteLength(value, "utf8") <= 72,
    ),
];
export const errors = (req) =>
  Object.fromEntries(
    validationResult(req)
      .array({ onlyFirstError: true })
      .map((e) => [e.path, e.msg]),
  );
export function signedIn(req, res, next) {
  if (!req.user)
    return res.status(401).render("error", {
      title: "Sign in required",
      message: "Please log in to continue.",
    });
  next();
}
export function adminOnly(req, res, next) {
  if (!req.user?.is_admin)
    return res.status(403).render("error", {
      title: "Access denied",
      message: "Only administrators can delete messages.",
    });
  next();
}
export function validId(req, res, next) {
  if (
    !/^[1-9]\d{0,9}$/.test(req.params.id) ||
    Number(req.params.id) > 2147483647
  )
    return res.status(404).render("error", {
      title: "Not found",
      message: "That message does not exist.",
    });
  next();
}
