import crypto from "node:crypto";

export function generateRandomCodocId(): string {
  return crypto.randomBytes(4).toString("hex");
}
