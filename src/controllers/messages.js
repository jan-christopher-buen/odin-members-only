import * as db from "../db/queries.js";
import { errors } from "../middleware/validation.js";
import { form } from "./accounts.js";
export async function index(req, res) {
  res.render("index", {
    title: "The message board",
    messages: await db.messages(
      Boolean(req.user?.is_member || req.user?.is_admin),
    ),
  });
}
export async function create(req, res) {
  const issues = errors(req);
  if (Object.keys(issues).length)
    return form("message", req, res.status(400), {
      errors: issues,
      values: {
        title: typeof req.body.title === "string" ? req.body.title : "",
        body: typeof req.body.body === "string" ? req.body.body : "",
      },
    });
  await db.createMessage(req.user.id, req.body.title, req.body.body);
  res.redirect("/");
}
export async function confirm(req, res) {
  const message = await db.message(req.params.id);
  if (!message) return missing(res);
  res.render("delete", { title: "Delete message", message });
}
export async function remove(req, res) {
  if (!(await db.deleteMessage(req.params.id))) return missing(res);
  res.redirect("/");
}
function missing(res) {
  return res.status(404).render("error", {
    title: "Not found",
    message: "That message does not exist.",
  });
}
