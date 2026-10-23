import "server-only";
import {
  randomBytes,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import argon2 from "argon2";

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const randomToken = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function origin() {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new Error("APP_ORIGIN is required for accounts");
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    !(
      url.protocol === "https:" ||
      (process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    )
  ) {
    throw new Error("Invalid APP_ORIGIN for accounts");
  }
  return value;
}

function key(name: string) {
  const value = process.env[name] ?? "";
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`Invalid ${name}`);
  return Buffer.from(value, "hex");
}
export const privateKey = (value: string) =>
  createHmac("sha256", key("RATE_LIMIT_HMAC_KEY")).update(value).digest("hex");
export type Encrypted = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
};
export function encrypt(
  value: string,
  keyName = "ACCOUNT_EMAIL_ENCRYPTION_KEY",
): Encrypted {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(keyName), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: 1,
  };
}
export function decrypt(value: Encrypted) {
  if (value.keyVersion !== 1) throw new Error("Unsupported email key version");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key("ACCOUNT_EMAIL_ENCRYPTION_KEY"),
    Buffer.from(value.iv, "base64"),
  );
  cipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(value.ciphertext, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
export const hashPassword = (value: string) =>
  argon2.hash(value, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
export const checkPassword = (hash: string, value: string) =>
  argon2.verify(hash, value);
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomToken()));

export function mailConfiguration() {
  origin();
  key("ACCOUNT_EMAIL_ENCRYPTION_KEY");
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from || /[\r\n]/.test(from))
    throw new Error("Account email is not configured");
  return { apiKey, from };
}

export class AccountError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
