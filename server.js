// Cipher Lab server. No dependencies: needs Node 24 or newer.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { DatabaseSync } = require("node:sqlite");

const scrypt = promisify(crypto.scrypt);
const DAY = 24 * 60 * 60 * 1000;
const SESSION_LENGTH = 7 * DAY;
const MAX_INBOX = 100;

const FILES = Object.fromEntries([
  ["/", "index.html", "text/html"],
  ["/style.css", "style.css", "text/css"],
  ["/ciphers.js", "ciphers.js", "text/javascript"],
  ["/lab.js", "lab.js", "text/javascript"],
  ["/app.js", "app.js", "text/javascript"]
].map(([url, name, type]) => [url, { file: path.join(__dirname, "public", name), type }]));

// Which key each cipher accepts.
const KEYS = {
  caesar: /^([1-9]|1\d|2[0-5])$/,
  atbash: /^$/,
  numbers: /^$/,
  vigenere: /^[A-Z]{1,30}$/,
  rail: /^[2-6]$/
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// secureCookies: set when served over HTTPS. trustProxy: set only behind your own reverse proxy.
function createServer({ database = ":memory:", secureCookies = false, trustProxy = false } = {}) {
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      salt BLOB NOT NULL, hash BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY, sender INTEGER NOT NULL REFERENCES users(id),
      recipient INTEGER NOT NULL REFERENCES users(id),
      cipher TEXT NOT NULL, key TEXT NOT NULL, text TEXT NOT NULL, sent_at INTEGER NOT NULL);
  `);

  const hits = new Map();
  function limit(name, max, windowMs) {
    const now = Date.now();
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    let entry = hits.get(name);
    if (!entry || entry.reset < now) hits.set(name, entry = { count: 0, reset: now + windowMs });
    if (++entry.count > max) throw new HttpError(429, "Too many tries. Please wait a while.");
  }

  const tokenHash = token => crypto.createHash("sha256").update(token).digest("hex");
  const readToken = req => /(?:^|;\s*)session=([a-f0-9]{64})/.exec(req.headers.cookie || "")?.[1];
  const cookie = (value, ms) =>
    `session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ms / 1000}${secureCookies ? "; Secure" : ""}`;

  function currentUser(req) {
    const token = readToken(req);
    return token && db.prepare(
      "SELECT users.id, users.username FROM sessions JOIN users ON users.id = user_id WHERE token = ? AND expires > ?"
    ).get(tokenHash(token), Date.now());
  }

  function endSession(req) {
    const token = readToken(req);
    if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(tokenHash(token));
  }

  function startSession(req, res, userId) {
    endSession(req);
    db.prepare("DELETE FROM sessions WHERE expires <= ?").run(Date.now());
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(tokenHash(token), userId, Date.now() + SESSION_LENGTH);
    res.setHeader("Set-Cookie", cookie(token, SESSION_LENGTH));
  }

  async function readBody(req) {
    // Requiring JSON stops other websites from submitting forms to us.
    if (!(req.headers["content-type"] || "").startsWith("application/json")) {
      throw new HttpError(415, "Expected JSON.");
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      if ((size += chunk.length) > 16 * 1024) throw new HttpError(413, "That's too big.");
      chunks.push(chunk);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks)); } catch { throw new HttpError(400, "Bad request."); }
    if (!body || typeof body !== "object") throw new HttpError(400, "Bad request.");
    return body;
  }

  async function handle(req, res, url) {
    const route = `${req.method} ${url}`;
    const ip = (trustProxy && req.headers["x-forwarded-for"]?.split(",").pop().trim()) || req.socket.remoteAddress;

    if (route === "GET /api/me") return { username: currentUser(req)?.username ?? null };

    if (route === "POST /api/register" || route === "POST /api/login") {
      const { username, password } = await readBody(req);
      if (typeof username !== "string" || typeof password !== "string" || password.length > 100) {
        throw new HttpError(400, "Enter a username and password.");
      }
      if (route === "POST /api/register") {
        if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
          throw new HttpError(400, "Usernames are 3 to 20 letters, numbers or _.");
        }
        if (password.length < 8) throw new HttpError(400, "Passwords need at least 8 characters.");
        limit(`register ${ip}`, 40, 60 * 60 * 1000); // a whole class may share one address
        const salt = crypto.randomBytes(16);
        const hash = await scrypt(password, salt, 64);
        let id;
        try {
          id = db.prepare("INSERT INTO users (username, salt, hash) VALUES (?, ?, ?)").run(username, salt, hash).lastInsertRowid;
        } catch (error) {
          if (/UNIQUE/.test(error.message)) throw new HttpError(409, "That username is taken.");
          throw error;
        }
        startSession(req, res, id);
        return { username };
      }
      const attempt = `login ${ip} ${username.toLowerCase().slice(0, 20)}`;
      limit(attempt, 10, 15 * 60 * 1000);
      limit(`logins ${ip}`, 200, 15 * 60 * 1000);
      const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
      // Hash even for unknown names, so timing doesn't reveal which names exist.
      const hash = await scrypt(password, user?.salt ?? Buffer.alloc(16), 64);
      if (!user || !crypto.timingSafeEqual(hash, user.hash)) throw new HttpError(401, "Wrong username or password.");
      hits.delete(attempt);
      startSession(req, res, user.id);
      return { username: user.username };
    }

    if (route === "POST /api/logout") {
      await readBody(req);
      endSession(req);
      res.setHeader("Set-Cookie", cookie("", 0));
      return {};
    }

    if (url === "/api/messages" || url.startsWith("/api/messages/")) {
      const user = currentUser(req);
      if (!user) throw new HttpError(401, "Please sign in again.");

      if (route === "GET /api/messages") {
        const rows = db.prepare(
          `SELECT messages.id, users.username AS "from", cipher, key, text, sent_at AS sentAt
           FROM messages JOIN users ON users.id = sender
           WHERE recipient = ? ORDER BY messages.id DESC`).all(user.id);
        return { messages: rows };
      }

      if (route === "POST /api/messages") {
        const { to, cipher, key, text } = await readBody(req);
        limit(`send ${user.id}`, 20, 60 * 1000);
        if (!Object.hasOwn(KEYS, cipher) || typeof key !== "string" || !KEYS[cipher].test(key)) {
          throw new HttpError(400, "That cipher or key isn't right.");
        }
        // The Numbers cipher can make text a few times longer than what was typed.
        if (typeof text !== "string" || !text.trim() || text.length > 2000) {
          throw new HttpError(400, "Messages need some text, and can't be too long.");
        }
        const friend = typeof to === "string" && db.prepare("SELECT id FROM users WHERE username = ?").get(to);
        if (!friend) throw new HttpError(404, "No account has that username.");
        const { total } = db.prepare("SELECT COUNT(*) AS total FROM messages WHERE recipient = ?").get(friend.id);
        if (total >= MAX_INBOX) throw new HttpError(409, "Their inbox is full. Ask them to delete some messages.");
        db.prepare("INSERT INTO messages (sender, recipient, cipher, key, text, sent_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(user.id, friend.id, cipher, key, text, Date.now());
        return {};
      }

      const id = /^DELETE \/api\/messages\/(\d{1,15})$/.exec(route)?.[1];
      if (id) {
        // You can only delete messages that were sent to you.
        const { changes } = db.prepare("DELETE FROM messages WHERE id = ? AND recipient = ?").run(Number(id), user.id);
        if (!changes) throw new HttpError(404, "Message not found.");
        return {};
      }
    }

    throw new HttpError(404, "Not found.");
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    const url = req.url.split("?")[0];
    try {
      if (req.method === "GET" && Object.hasOwn(FILES, url)) {
        res.setHeader("Content-Type", `${FILES[url].type}; charset=utf-8`);
        return res.end(fs.readFileSync(FILES[url].file));
      }
      const reply = await handle(req, res, url);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(reply));
    } catch (error) {
      if (!(error instanceof HttpError)) console.error(error);
      res.statusCode = error.status || 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: error.status ? error.message : "Something went wrong." }));
    }
  });
  server.on("close", () => db.close());
  return server;
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || "127.0.0.1";
  const database = process.env.DATABASE || path.join(__dirname, "data", "cipher-lab.db");
  fs.mkdirSync(path.dirname(database), { recursive: true });
  createServer({
    database,
    secureCookies: process.env.SECURE_COOKIES === "1",
    trustProxy: process.env.TRUST_PROXY === "1"
  }).listen(port, host, () => console.log(`Cipher Lab is running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`));
}
