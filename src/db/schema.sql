CREATE TABLE IF NOT EXISTS users (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 first_name varchar(80) NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 80),
 last_name varchar(80) NOT NULL CHECK (length(trim(last_name)) BETWEEN 1 AND 80),
 username varchar(30) NOT NULL CHECK (username ~ '^[a-zA-Z0-9_-]{3,30}$'),
 password_hash text NOT NULL,
 is_member boolean NOT NULL DEFAULT false,
 is_admin boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));
CREATE TABLE IF NOT EXISTS messages (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 author_id integer NOT NULL REFERENCES users(id),
 title varchar(120) NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
 body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS session (
 sid varchar NOT NULL PRIMARY KEY,
 sess json NOT NULL,
 expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session(expire);
