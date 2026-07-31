import { randomBytes } from "crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function newId(prefix?: string): string {
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return prefix ? `${prefix}_${out}` : out;
}
