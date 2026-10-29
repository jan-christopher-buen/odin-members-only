import { pool } from "./pool.js";
export async function userById(id) {
  return (
    await pool.query(
      "SELECT id, first_name, last_name, username, is_member, is_admin FROM users WHERE id=$1",
      [id],
    )
  ).rows[0];
}
export async function credentials(username) {
  return (
    await pool.query(
      "SELECT id, password_hash FROM users WHERE lower(username)=lower($1)",
      [username],
    )
  ).rows[0];
}
export async function createUser({ firstName, lastName, username }, hash) {
  await pool.query(
    "INSERT INTO users(first_name,last_name,username,password_hash) VALUES($1,$2,$3,$4)",
    [firstName, lastName, username, hash],
  );
}
export async function grant(id, admin) {
  await pool.query(
    admin
      ? "UPDATE users SET is_member=true, is_admin=true WHERE id=$1"
      : "UPDATE users SET is_member=true WHERE id=$1",
    [id],
  );
}
export async function messages(privateView) {
  return (
    await pool.query(
      privateView
        ? "SELECT m.id,m.title,m.body,m.created_at,u.first_name,u.last_name FROM messages m JOIN users u ON u.id=m.author_id ORDER BY m.created_at DESC,m.id DESC"
        : "SELECT id,title,body FROM messages ORDER BY created_at DESC,id DESC",
    )
  ).rows;
}
export async function createMessage(id, title, body) {
  await pool.query(
    "INSERT INTO messages(author_id,title,body) VALUES($1,$2,$3)",
    [id, title, body],
  );
}
export async function message(id) {
  return (
    await pool.query("SELECT id,title,body FROM messages WHERE id=$1", [id])
  ).rows[0];
}
export async function deleteMessage(id) {
  return (
    await pool.query("DELETE FROM messages WHERE id=$1 RETURNING id", [id])
  ).rowCount;
}
