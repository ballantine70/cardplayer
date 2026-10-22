import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const COOKIE = 'cp_auth';
const MAX_AGE = 30 * 24 * 60 * 60;
/** Failed attempts allowed per address per window. */
const ATTEMPTS = 10;
const WINDOW_MS = 60_000;

const sha = (s: string) => createHmac('sha256', 'cardplayer-auth-v1').update(s).digest();

export class SiteAuth {
  private token: string;
  private passwordHash: Buffer;
  private failures = new Map<string, { count: number; since: number }>();

  constructor(password: string) {
    this.passwordHash = sha(password);
    // Derived from the password, so changing it signs everyone out.
    this.token = createHmac('sha256', password).update('cardplayer-session-v1').digest('base64url');
  }

  isAuthorised(req: IncomingMessage): boolean {
    const value = parseCookies(req.headers.cookie)[COOKIE];
    if (!value) return false;
    const a = Buffer.from(value);
    const b = Buffer.from(this.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Paths reachable without logging in. */
  isPublic(pathname: string) {
    return pathname === '/login' || pathname === '/api/login' || pathname === '/api/health';
  }

  /** Respond to a request that is not logged in. */
  deny(req: IncomingMessage, res: ServerResponse, pathname: string) {
    if (pathname.startsWith('/api/')) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Log in first' }));
      return;
    }
    const next = encodeURIComponent((req.url ?? '/').slice(0, 500));
    res.writeHead(303, { location: `/login?next=${next}` }).end();
  }

  async login(req: IncomingMessage, res: ServerResponse) {
    const ip = clientIp(req);
    const f = this.failures.get(ip);
    if (f && Date.now() - f.since < WINDOW_MS && f.count >= ATTEMPTS) {
      res.writeHead(303, { location: '/login?error=busy' }).end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 4096) break;
      chunks.push(chunk as Buffer);
    }
    const form = new URLSearchParams(Buffer.concat(chunks).toString());
    const next = safeNext(form.get('next'));
    if (!timingSafeEqual(sha(form.get('password') ?? ''), this.passwordHash)) {
      const entry = f && Date.now() - f.since < WINDOW_MS ? f : { count: 0, since: Date.now() };
      entry.count++;
      this.failures.set(ip, entry);
      res.writeHead(303, { location: `/login?error=1&next=${encodeURIComponent(next)}` }).end();
      return;
    }
    this.failures.delete(ip);
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.writeHead(303, {
      location: next,
      'set-cookie': `${COOKIE}=${this.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`,
    });
    res.end();
  }

  logout(res: ServerResponse) {
    res.writeHead(303, { location: '/login', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` }).end();
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function clientIp(req: IncomingMessage) {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

/** Only allow redirects to paths on this site. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

export function loginPage(error: string | null, next: string): string {
  const message =
    error === 'busy' ? 'Too many attempts. Wait a minute and try again.' : error ? 'That password is not right.' : '';
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cardplayer</title>
<style>
  :root { --bg: #f4f2ee; --panel: #fff; --ink: #23211d; --muted: #6f6a61; --line: #ddd8ce; --accent: #2f5d8a; --accent-ink: #fff; --danger: #b3261e; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1c1d20; --panel: #26282c; --ink: #e9e7e2; --muted: #a19c93; --line: #3b3e44; --accent: #6aa0d8; --accent-ink: #10151b; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--ink); font: 14px system-ui, -apple-system, 'Segoe UI', sans-serif; }
  form { width: min(340px, 100%); background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
  h1 { font-size: 18px; margin: 0; }
  p { margin: 0; color: var(--muted); }
  input { font: inherit; color: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); }
  button { font: inherit; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); cursor: pointer; }
  .error { color: var(--danger); }
</style>
</head>
<body>
<form method="post" action="/api/login">
  <h1>Cardplayer</h1>
  <p>Enter the password to continue.</p>
  ${message ? `<p class="error" role="alert">${message}</p>` : ''}
  <input type="password" name="password" aria-label="Password" autocomplete="current-password" autofocus required>
  <input type="hidden" name="next" value="${esc(next)}">
  <button type="submit">Continue</button>
</form>
</body>
</html>`;
}
