import type { Database } from "./learning-store";
export type PortalActor = {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "teacher" | "student";
  student_id: string | null;
  teacher_id: string | null;
};
export class AccessError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message);
  }
}
const cookieName = "mpec_session";
const encoder = new TextEncoder();
const hex = (value: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(value))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const unhex = (value: string) =>
  Uint8Array.from(value.match(/.{2}/g) || [], (s) => parseInt(s, 16));
export async function digest(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
export async function passwordHash(
  password: string,
  salt = hex(crypto.getRandomValues(new Uint8Array(16))),
) {
  if (password.length < 12 || password.length > 256)
    throw new AccessError("Use a password with 12 to 256 characters.", 400);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  // WebCrypto in workerd limits PBKDF2 iterations to 100,000.
  const bytes = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations: 100000 },
    key,
    256,
  );
  return `pbkdf2-sha256:100000:${salt}:${hex(bytes)}`;
}
export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split(":");
  if (
    parts.length !== 4 ||
    parts[0] !== "pbkdf2-sha256" ||
    parts[1] !== "100000" ||
    !/^[a-f0-9]{32}$/.test(parts[2]) ||
    !/^[a-f0-9]{64}$/.test(parts[3])
  )
    return false;
  let actual: string;
  try {
    actual = await passwordHash(password, parts[2]);
  } catch {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < actual.length; i++)
    difference |= actual.charCodeAt(i) ^ stored.charCodeAt(i);
  return difference === 0;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new AccessError("This request is not from the portal.", 403);
  if (request.headers.get("Sec-Fetch-Site") === "cross-site")
    throw new AccessError("Cross-site requests are not allowed.", 403);
}
export class PortalAuth {
  constructor(readonly db: Database) {}
  async actor(request: Request): Promise<PortalActor> {
    const token = request.headers
      .get("Cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new AccessError("Sign in to continue.", 401);
    const actor = await this.db
      .prepare(
        `SELECT a.id,a.email,a.display_name,a.role,a.student_id,a.teacher_id FROM portal_sessions s JOIN portal_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND a.disabled=0`,
      )
      .bind(await digest(token), Date.now())
      .first<PortalActor>();
    if (!actor)
      throw new AccessError("Your session has expired. Sign in again.", 401);
    return actor;
  }
  async issue(accountId: string, request: Request) {
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await this.db
      .prepare(
        "INSERT INTO portal_sessions(token_hash,account_id,expires_at) VALUES (?,?,?)",
      )
      .bind(await digest(token), accountId, Date.now() + 12 * 3600000)
      .run();
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  }
  async logout(request: Request) {
    const token = request.headers
      .get("Cookie")
      ?.match(/(?:^|;\s*)mpec_session=([a-f0-9]{64})/)?.[1];
    if (token)
      await this.db
        .prepare("DELETE FROM portal_sessions WHERE token_hash=?")
        .bind(await digest(token))
        .run();
    return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  }
  async login(email: string, password: string, request: Request) {
    const normalized = email.trim().toLowerCase();
    const key = await digest(
      normalized + ":" + (request.headers.get("CF-Connecting-IP") || "local"),
    );
    const attempt = await this.db
      .prepare(
        "SELECT attempts,blocked_until FROM portal_login_attempts WHERE key=?",
      )
      .bind(key)
      .first<{ attempts: number; blocked_until: number }>();
    if (attempt && attempt.attempts >= 10 && attempt.blocked_until > Date.now())
      throw new AccessError("Too many attempts. Try again in 15 minutes.", 429);
    // Every attempt consumes a slot before password work, including concurrent requests.
    await this.db
      .prepare(
        `INSERT INTO portal_login_attempts(key,attempts,blocked_until) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN blocked_until<? THEN 1 ELSE attempts+1 END,blocked_until=CASE WHEN blocked_until<? THEN ? ELSE blocked_until END`,
      )
      .bind(
        key,
        Date.now() + 900000,
        Date.now(),
        Date.now(),
        Date.now() + 900000,
      )
      .run();
    const count = await this.db
      .prepare("SELECT attempts FROM portal_login_attempts WHERE key=?")
      .bind(key)
      .first<{ attempts: number }>();
    if (Number(count?.attempts) > 10)
      throw new AccessError("Too many attempts. Try again in 15 minutes.", 429);
    const account = await this.db
      .prepare(
        "SELECT id,password_hash FROM portal_accounts WHERE email=? AND disabled=0",
      )
      .bind(normalized)
      .first<{ id: string; password_hash: string }>();
    const dummy =
      "pbkdf2-sha256:100000:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000";
    if (
      !(await verifyPassword(password, account?.password_hash || dummy)) ||
      !account
    )
      throw new AccessError("Email or password is incorrect.", 401);
    await this.db
      .prepare("DELETE FROM portal_login_attempts WHERE key=?")
      .bind(key)
      .run();
    return this.issue(account.id, request);
  }
  async bootstrap(
    input: { email: string; password: string; name: string; secret?: string },
    request: Request,
    configuredSecret?: string,
  ) {
    const hostname = new URL(request.url).hostname;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
    if (
      !local &&
      (!configuredSecret ||
        !input.secret ||
        (await digest(configuredSecret)) !== (await digest(input.secret)))
    )
      throw new AccessError(
        "Administrator setup requires the server bootstrap key.",
      );
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || !input.name.trim())
      throw new AccessError("Enter a name and valid email.", 400);
    const id = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO app_settings(key,value) VALUES ('portal_admin_initialized','true')",
        )
        .bind(),
      this.db
        .prepare(
          "INSERT INTO portal_accounts(id,email,password_hash,display_name,role) VALUES (?,?,?,?,'admin')",
        )
        .bind(
          id,
          input.email.trim().toLowerCase(),
          await passwordHash(input.password),
          input.name.trim(),
        ),
    ]);
    return this.issue(id, request);
  }
}
