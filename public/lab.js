const $ = id => document.getElementById(id);

const CIPHERS = {
  caesar: {
    name: "Caesar",
    about: "Julius Caesar's trick: slide every letter along the alphabet. Move the slider to change how far.",
    run: (t, u) => caesar(t, Number($("shift").value), u),
    box: "shiftBox", chart: true
  },
  atbash: {
    name: "Mirror (Atbash)",
    about: "Flip the alphabet: A becomes Z, B becomes Y, and so on. No key needed!",
    run: t => atbash(t),
    chart: true
  },
  numbers: {
    name: "Numbers",
    about: "Each letter becomes its place in the alphabet: A is 1, B is 2. Dashes go between letters. Tip: spell out real numbers, like \"nine\".",
    run: (t, u) => numbers(t, u),
    chart: true
  },
  vigenere: {
    name: "Secret Word (Vigenère)",
    about: "Like Caesar, but a secret word changes the shift for each letter. A shifts 0, B shifts 1, C shifts 2…",
    run: (t, u) => vigenere(t, $("word").value, u),
    box: "wordBox"
  },
  rail: {
    name: "Zigzag (Rail Fence)",
    about: "Write the message in a zigzag, then read it one row at a time. The letters stay the same but move around. Spaces count too!",
    run: (t, u) => railFence(t, Number($("rails").value), u),
    box: "railBox"
  }
};

let current = "caesar";
let unlock = false;

function update() {
  const cipher = CIPHERS[current];
  const text = $("input").value;
  $("shiftValue").textContent = $("shift").value;
  $("railsValue").textContent = $("rails").value;
  $("about").textContent = cipher.about;
  for (const id of ["shiftBox", "wordBox", "railBox"]) $(id).hidden = cipher.box !== id;
  for (const b of $("ciphers").children) b.setAttribute("aria-pressed", b.dataset.id === current);
  $("lock").setAttribute("aria-pressed", !unlock);
  $("unlock").setAttribute("aria-pressed", unlock);
  $("inputLabel").textContent = unlock ? "Secret message" : "Your message";
  $("result").textContent = cipher.run(text, unlock);
  if (current === "vigenere" && !/[a-z]/i.test($("word").value)) {
    $("result").textContent = "Type a secret word first!";
  }
  $("input").maxLength = unlock ? 2000 : 500;
  $("sendForm").hidden = unlock;
  $("sendStatus").textContent = "";
  drawHelper(cipher, text);
}

// Letter chart for swap ciphers, or a picture of the zigzag.
function drawHelper(cipher, text) {
  const chart = $("chart");
  chart.replaceChildren();
  $("chartTitle").replaceChildren();
  if (cipher.chart) {
    $("chartTitle").innerHTML = "<p>Code chart: normal letter on top, <b>secret</b> below.</p>";
    for (const letter of ABC) {
      const cell = document.createElement("div");
      const secret = document.createElement("b");
      secret.textContent = cipher.run(letter, false);
      cell.append(letter, secret);
      chart.append(cell);
    }
  } else if (current === "rail" && text) {
    const rows = Number($("rails").value);
    // Show the readable message, whichever direction we are going.
    const plain = [...(unlock ? cipher.run(text, true) : text)].slice(0, 30)
      .map(c => /\s/.test(c) ? "␣" : c);
    const row = zigzag(plain.length, rows);
    const pre = document.createElement("pre");
    pre.textContent = Array.from({ length: rows }, (_, r) =>
      plain.map((c, i) => row[i] === r ? c : "·").join(" ")).join("\n");
    $("chartTitle").append("Zigzag picture (first 30 characters):", pre);
  }
}

for (const [id, cipher] of Object.entries(CIPHERS)) {
  const button = document.createElement("button");
  button.textContent = cipher.name;
  button.dataset.id = id;
  button.onclick = () => { current = id; update(); };
  $("ciphers").append(button);
}

// Switching direction carries the result over, so kids can check it round-trips.
function setMode(next) {
  if (next === unlock) return;
  const result = CIPHERS[current].run($("input").value, unlock);
  unlock = next;
  $("input").value = result;
  update();
}
$("lock").onclick = () => setMode(false);
$("unlock").onclick = () => setMode(true);
for (const id of ["input", "shift", "word", "rails"]) $(id).oninput = update;

update();
