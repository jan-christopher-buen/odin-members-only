import { Passport } from "passport";
import { Strategy } from "passport-local";
import bcrypt from "bcryptjs";
import { credentials, userById } from "../db/queries.js";
const dummyHash = await bcrypt.hash("unusable-dummy-comparison-value", 12);
export function configurePassport() {
  const passport = new Passport();
  passport.use(
    new Strategy(async (username, password, done) => {
      try {
        const user = await credentials(username);
        const valid = await bcrypt.compare(
          password,
          user?.password_hash || dummyHash,
        );
        done(null, valid && user ? await userById(user.id) : false);
      } catch (error) {
        done(error);
      }
    }),
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      done(null, (await userById(id)) || false);
    } catch (error) {
      done(error);
    }
  });
  return passport;
}
