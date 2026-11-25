// Accounts, sending, and the inbox.

async function api(method, path, data) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined
    });
  } catch {
    throw new Error("Can't reach Cipher Lab. Check your connection.");
  }
  const reply = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/api/messages")) showSignedOut();
    throw new Error(reply.error || "Something went wrong.");
  }
  return reply;
}

function make(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text; // never innerHTML: messages come from other people
  if (className) element.className = className;
  return element;
}

let registering = false;

function setAuthMode(next) {
  registering = next;
  $("showLogin").setAttribute("aria-pressed", !next);
  $("showRegister").setAttribute("aria-pressed", next);
  $("authButton").textContent = next ? "Create account" : "Sign in";
  $("password").autocomplete = next ? "new-password" : "current-password";
  $("authHelp").textContent = next
    ? "Pick a made-up username (not your real name) and a password with at least 8 characters. Write it down somewhere safe: it can't be reset."
    : "";
  $("authError").textContent = "";
}

function showSignedOut() {
  $("signedIn").hidden = true;
  $("signedOut").hidden = false;
  // Clear everything, so the next person on a shared computer sees nothing.
  $("messages").replaceChildren();
  $("inboxStatus").textContent = "";
  $("to").value = "";
  $("input").value = "Hello world!";
  $("word").value = "TIGER";
  unlock = false;
  update();
}

function showSignedIn(username) {
  $("signedOut").hidden = true;
  $("signedIn").hidden = false;
  $("me").textContent = username;
  $("authForm").reset();
  showTab("lab");
}

function showTab(name) {
  $("lab").hidden = name !== "lab";
  $("inbox").hidden = name !== "inbox";
  $("showLab").setAttribute("aria-pressed", name === "lab");
  $("showInbox").setAttribute("aria-pressed", name === "inbox");
  if (name === "inbox") loadInbox();
}

// A grid with the secret symbol on top and the real letter underneath.
function keyChart(pairs) {
  const grid = make("div", undefined, "key");
  for (const [secret, real] of pairs) {
    const cell = make("div", String(secret));
    cell.append(make("b", real));
    grid.append(cell);
  }
  return grid;
}

// Everything the reader needs to decode one message by hand.
function decodingHelp({ cipher, key, text }) {
  const box = make("div");
  const add = (...items) => box.append(...items);
  const letters = [...ABC];
  const chartIntro = "Find each secret letter on top. The blue letter under it is the real one.";

  if (cipher === "caesar") {
    const shift = Number(key);
    add(make("p", `Clue: A = ${slide("A", shift)}  (a real A is written as ${slide("A", shift)}. Shift: ${shift})`, "clue"),
        make("p", chartIntro),
        keyChart(letters.map(c => [c, caesar(c, shift, true)])));
  } else if (cipher === "atbash") {
    add(make("p", "Clue: A = Z, B = Y, C = X  (the alphabet is flipped)", "clue"),
        make("p", chartIntro),
        keyChart(letters.map(c => [c, atbash(c)])));
  } else if (cipher === "numbers") {
    add(make("p", "Clue: 1 = A, 2 = B, 3 = C. A dash separates letters.", "clue"),
        make("p", "Find each number on top. The blue letter under it is the real one."),
        keyChart(letters.map((c, i) => [i + 1, c])));
  } else if (cipher === "vigenere") {
    const word = key.toUpperCase();
    add(make("p", `Clue: the secret word is ${word}`, "clue"),
        make("p", `Write ${word} over and over above the secret letters (skip spaces and punctuation). ` +
          "For each secret letter, slide BACK in the alphabet by the number for the letter above it. Go from A round to Z if you need to."));
    const steps = make("ul");
    for (const c of word) steps.append(make("li", `${c} means slide back ${ABC.indexOf(c)}`));
    add(steps);
    const first = text.match(/[a-z]/i);
    if (first) {
      add(make("p", `Start here: the first secret letter is ${first[0].toUpperCase()}. Slide back ${ABC.indexOf(word[0])} to get ${vigenere(first[0], word, true).toUpperCase()}.`));
    }
  } else if (cipher === "rail") {
    const rows = Number(key);
    const count = [...text].length;
    const row = zigzag(count, rows);
    add(make("p", `Clue: the zigzag has ${rows} rows`, "clue"),
        make("p", "1. Here is the secret message cut into its rows (␣ is a space):"));
    const list = make("ul");
    let start = 0;
    for (let r = 0; r < rows; r++) {
      const size = row.filter(x => x === r).length;
      const piece = [...text].slice(start, start + size).join("").replace(/\s/g, "␣");
      list.append(make("li", `Row ${r + 1}: ${piece}`));
      start += size;
    }
    const order = [...Array(rows).keys()].concat([...Array(Math.max(rows - 2, 0)).keys()].map(i => rows - 2 - i));
    add(list, make("p", `2. Take the next unused character from these rows, in this order, over and over: ${order.map(r => r + 1).join(", ")}.`));
  }
  return box;
}

const CIPHER_NAMES = Object.fromEntries(Object.entries(CIPHERS).map(([id, c]) => [id, c.name]));

function solve({ cipher, key, text }) {
  if (cipher === "caesar") return caesar(text, Number(key), true);
  if (cipher === "atbash") return atbash(text);
  if (cipher === "numbers") return numbers(text, true);
  if (cipher === "vigenere") return vigenere(text, key, true);
  return railFence(text, Number(key), true);
}

function messageCard(message) {
  const card = make("article", undefined, "message");
  const answer = make("p", undefined, "secret");
  answer.hidden = true;
  const peek = make("button", "Show the answer");
  peek.type = "button";
  peek.onclick = () => {
    answer.hidden = !answer.hidden;
    answer.textContent = "Answer: " + solve(message);
    peek.textContent = answer.hidden ? "Show the answer" : "Hide the answer";
  };
  const remove = make("button", "Delete");
  remove.type = "button";
  remove.onclick = async () => {
    if (!confirm("Delete this message?")) return;
    try {
      await api("DELETE", `/api/messages/${message.id}`);
      loadInbox();
    } catch (error) {
      $("inboxStatus").textContent = error.message;
    }
  };
  const buttons = make("div", undefined, "buttons");
  buttons.append(peek, remove);
  card.append(
    make("h3", `From ${message.from}`),
    make("div", new Date(message.sentAt).toLocaleString()),
    make("p", `Cipher used: ${CIPHER_NAMES[message.cipher]}`),
    make("p", message.text, "secret"),
    decodingHelp(message), buttons, answer);
  return card;
}

async function loadInbox() {
  $("inboxStatus").textContent = "Checking…";
  try {
    const { messages } = await api("GET", "/api/messages");
    $("messages").replaceChildren(...messages.map(messageCard));
    $("inboxStatus").textContent = messages.length ? "" : "No messages yet.";
  } catch (error) {
    $("inboxStatus").textContent = error.message;
  }
}

$("showLogin").onclick = () => setAuthMode(false);
$("showRegister").onclick = () => setAuthMode(true);
$("showLab").onclick = () => showTab("lab");
$("showInbox").onclick = () => showTab("inbox");
$("refresh").onclick = loadInbox;

$("authForm").onsubmit = async event => {
  event.preventDefault();
  $("authButton").disabled = true;
  $("authError").textContent = "";
  try {
    const { username } = await api("POST", registering ? "/api/register" : "/api/login",
      { username: $("username").value.trim(), password: $("password").value });
    showSignedIn(username);
  } catch (error) {
    $("authError").textContent = error.message;
  }
  $("authButton").disabled = false;
};

$("logout").onclick = async () => {
  try {
    await api("POST", "/api/logout", {});
    showSignedOut();
  } catch (error) {
    alert("Not signed out. " + error.message);
  }
};

$("sendForm").onsubmit = async event => {
  event.preventDefault();
  const status = $("sendStatus");
  const plain = $("input").value;
  const word = $("word").value.toUpperCase().replace(/[^A-Z]/g, "");
  const key = { caesar: $("shift").value, vigenere: word, rail: $("rails").value }[current] || "";
  if (!plain.trim()) return void (status.textContent = "Type a message first!");
  if (current === "vigenere" && !word) return void (status.textContent = "Type a secret word first!");
  const to = $("to").value.trim();
  const button = event.target.querySelector("button");
  button.disabled = true;
  try {
    // Only the scrambled text is sent.
    await api("POST", "/api/messages", { to, cipher: current, key, text: CIPHERS[current].run(plain, false) });
    status.textContent = `Sent to ${to}! ✅`;
  } catch (error) {
    status.textContent = error.message;
  }
  button.disabled = false;
};

api("GET", "/api/me").then(
  ({ username }) => username ? showSignedIn(username) : showSignedOut(),
  error => { showSignedOut(); $("authError").textContent = error.message; });
