const test = require("node:test");
const assert = require("node:assert");
const { createServer } = require("../server");
const c = require("../public/ciphers");

test("ciphers match known answers and decode again", () => {
  assert.equal(c.caesar("Hello world!", 3, false), "Khoor zruog!");
  assert.equal(c.atbash("Abz"), "Zya");
  assert.equal(c.numbers("Hello world", false), "8-5-12-12-15 23-15-18-12-4");
  assert.equal(c.vigenere("ATTACKATDAWN", "LEMON", false), "LXFOPVEFRNHR");
  assert.equal(c.railFence("WEAREDISCOVEREDFLEEATONCE", 3, false), "WECRLTEERDSOEEFEAOCAIVDEN");
  const message = "Meet me at the park at four!";
  for (let n = 1; n < 26; n++) assert.equal(c.caesar(c.caesar(message, n, false), n, true), message);
  for (let n = 2; n <= 6; n++) assert.equal(c.railFence(c.railFence(message, n, false), n, true), message);
});

test("accounts and messages", async t => {
  const server = createServer();
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(method, url, data, cookie, type = "application/json") {
    const response = await fetch(base + url, {
      method, body: data && JSON.stringify(data),
      headers: { ...(data && { "Content-Type": type }), ...(cookie && { Cookie: cookie }) }
    });
    return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  const account = (username, password = "password123") => ({ username, password });

  const alice = await call("POST", "/api/register", account("alice"));
  const bob = await call("POST", "/api/register", account("Bob"));
  const eve = await call("POST", "/api/register", account("eve"));
  assert.equal(alice.status, 200);
  assert.match(alice.cookie, /HttpOnly; SameSite=Strict/);
  const [a, b, e] = [alice, bob, eve].map(r => r.cookie.split(";")[0]);

  assert.equal((await call("POST", "/api/register", account("ALICE"))).status, 409);
  assert.equal((await call("POST", "/api/register", account("x y"))).status, 400);
  assert.equal((await call("POST", "/api/register", account("carol", "short"))).status, 400);
  assert.equal((await call("POST", "/api/login", account("alice", "wrongpassword"))).status, 401);
  assert.equal((await call("POST", "/api/login", account("Alice"))).body.username, "alice");

  const message = { to: "bob", cipher: "caesar", key: "13", text: "Uryyb" };
  assert.equal((await call("POST", "/api/messages", message)).status, 401);
  assert.equal((await call("POST", "/api/messages", message, a, "text/plain")).status, 415);
  assert.equal((await call("POST", "/api/messages", { ...message, to: "nobody" }, a)).status, 404);
  assert.equal((await call("POST", "/api/messages", { ...message, key: "99" }, a)).status, 400);
  assert.equal((await call("POST", "/api/messages", { ...message, cipher: "toString" }, a)).status, 400);
  assert.equal((await call("POST", "/api/messages", message, a)).status, 200);

  const inbox = (await call("GET", "/api/messages", null, b)).body.messages;
  assert.equal(inbox.length, 1);
  assert.deepEqual([inbox[0].from, inbox[0].cipher, inbox[0].key, inbox[0].text], ["alice", "caesar", "13", "Uryyb"]);
  assert.equal((await call("GET", "/api/messages", null, e)).body.messages.length, 0);
  assert.equal((await call("DELETE", `/api/messages/${inbox[0].id}`, null, e)).status, 404);
  assert.equal((await call("DELETE", `/api/messages/${inbox[0].id}`, null, b)).status, 200);

  assert.equal((await call("POST", "/api/logout", {}, b)).status, 200);
  assert.equal((await call("GET", "/api/messages", null, b)).status, 401);

  let last;
  for (let i = 0; i < 11; i++) last = await call("POST", "/api/login", account("eve", "wrongpassword"));
  assert.equal(last.status, 429);

  assert.equal((await fetch(base + "/../server.js")).status, 404);
});
