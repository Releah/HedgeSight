import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { pool } from "./db.js";

const scrypt = promisify(scryptCallback);
const sessionCookie = "hedgesight_session";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function validToken(request: Request): boolean {
  const expected = hashToken(process.env.WORKER_TOKEN ?? "local-development-token");
  const actual = hashToken(request.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export type AuthUser = { id: string; email: string; displayName: string; role: string };

function cookieValue(request: Request, name: string): string | null {
  for (const item of (request.headers.cookie ?? "").split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [scheme, encodedSalt, encodedHash] = stored.split("$");
  if (scheme !== "scrypt" || !encodedSalt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, "base64url");
  const actual = await scrypt(password, Buffer.from(encodedSalt, "base64url"), expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(request: Request, response: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const days = Math.max(1, Number(process.env.SESSION_DAYS ?? 7));
  await pool.query(`INSERT INTO user_sessions(user_id,token_hash,expires_at,ip_address,user_agent)
    VALUES($1,$2,now()+make_interval(days=>$3),$4,$5)`, [userId, hashToken(token), days, request.ip, request.get("user-agent")?.slice(0, 500)]);
  const secure = process.env.COOKIE_SECURE === "true" || request.secure;
  response.cookie(sessionCookie, token, { httpOnly: true, sameSite: "lax", secure, maxAge: days * 86_400_000, path: "/" });
}

export async function currentUser(request: Request): Promise<AuthUser | null> {
  const token = cookieValue(request, sessionCookie);
  if (!token) return null;
  const result = await pool.query(`SELECT u.id,u.email,u.display_name AS "displayName",u.role
    FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.enabled=true`, [hashToken(token)]);
  if (!result.rowCount) return null;
  void pool.query("UPDATE user_sessions SET last_seen_at=now() WHERE token_hash=$1 AND last_seen_at<now()-interval '5 minutes'", [hashToken(token)]);
  return result.rows[0];
}

export async function destroySession(request: Request, response: Response): Promise<void> {
  const token = cookieValue(request, sessionCookie);
  if (token) await pool.query("DELETE FROM user_sessions WHERE token_hash=$1", [hashToken(token)]);
  response.clearCookie(sessionCookie, { path: "/" });
}

export async function requireUser(request: Request, response: Response, next: NextFunction): Promise<void> {
  if (request.path === "/health" || request.path === "/version" || request.path.startsWith("/public/") || request.path.startsWith("/auth/") || request.path.startsWith("/workers/")) return next();
  const user = await currentUser(request);
  if (!user) { response.status(401).json({ error: "Authentication required" }); return; }
  response.locals.user = user;
  next();
}
