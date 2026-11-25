const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Move one letter forward by n places, keeping its upper/lower case.
function slide(letter, n) {
  const base = letter <= "Z" ? 65 : 97;
  return String.fromCharCode((letter.charCodeAt(0) - base + n + 26) % 26 + base);
}

function caesar(text, shift, unlock) {
  return text.replace(/[a-z]/gi, c => slide(c, unlock ? -shift : shift));
}

function atbash(text) {
  return text.replace(/[a-z]/gi, c => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
  });
}

function numbers(text, unlock) {
  if (unlock) {
    return text.replace(/\d+(-\d+)*/g, group =>
      group.split("-").map(n => ABC[n - 1] || "?").join(""));
  }
  return text.replace(/[a-z]+/gi, word =>
    [...word.toUpperCase()].map(c => ABC.indexOf(c) + 1).join("-"));
}

function vigenere(text, word, unlock) {
  const key = word.toUpperCase().replace(/[^A-Z]/g, "");
  if (!key) return text;
  let i = 0;
  return text.replace(/[a-z]/gi, c => {
    const shift = ABC.indexOf(key[i++ % key.length]);
    return slide(c, unlock ? -shift : shift);
  });
}

// Which row each position lands on when writing in a zigzag.
function zigzag(length, rows) {
  const period = 2 * (rows - 1);
  return Array.from({ length }, (_, i) => Math.min(i % period, period - i % period));
}

function railFence(text, rows, unlock) {
  const chars = [...text];
  const row = zigzag(chars.length, rows);
  // order[k] = the original position of the k-th scrambled character
  const order = chars.map((_, i) => i).sort((a, b) => row[a] - row[b] || a - b);
  if (!unlock) return order.map(i => chars[i]).join("");
  const plain = [];
  order.forEach((position, k) => plain[position] = chars[k]);
  return plain.join("");
}

if (typeof module !== "undefined") {
  module.exports = { ABC, slide, caesar, atbash, numbers, vigenere, zigzag, railFence };
}
