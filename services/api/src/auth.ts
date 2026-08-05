import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function validToken(request: Request): boolean {
  const expected = hashToken(process.env.WORKER_TOKEN ?? "local-development-token");
  const actual = hashToken(request.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
