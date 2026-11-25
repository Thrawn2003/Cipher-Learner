# Cipher Lab

Kids try out five ciphers (Caesar, Atbash, Numbers, Vigenère, Rail Fence) and send
scrambled messages to each other. Each received message names the cipher and shows
how to decode it.

## Run it

Needs Node 24 or newer. There is nothing to install.

```bash
npm start
```

Then open http://127.0.0.1:8787. Run the tests with `npm test`.

## Putting it online

This needs a host that runs Node and keeps files on disk. Static hosting such as
GitHub Pages will not work. Serve it over HTTPS and set:

| Setting | Purpose |
|---|---|
| `SECURE_COOKIES=1` | Only send the sign-in cookie over HTTPS |
| `TRUST_PROXY=1` | Only behind your own reverse proxy, so rate limits see real addresses |
| `HOST`, `PORT` | Where to listen (default `127.0.0.1:8787`) |
| `DATABASE` | Database file (default `data/cipher-lab.db`) |

Never commit the database. `data/` is ignored by git.

## Before real children use it

- Anyone who knows a username can send that account a message. There is no friend
  approval, blocking, reporting or moderation.
- Ciphers are puzzles, not security. Whoever runs the server can decode every message.
- Accounts collect only a username and password. There is no password reset or
  account deletion. Check the children's privacy laws where you are (for example
  COPPA in the US), which may require a parent's consent.
