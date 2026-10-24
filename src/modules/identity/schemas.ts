import { z } from "zod";

export const email = z.string().trim().pipe(z.email().max(254));
export const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use at most 128 characters.");
export const token = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "This link is invalid or expired.");
export const schemas = {
  register: z.strictObject({
    displayName: z.string().trim().min(1).max(200),
    email,
    password,
  }),
  login: z.strictObject({ email, password: z.string().min(1).max(128) }),
  "forgot-password": z.strictObject({ email }),
  "resend-verification": z.strictObject({ email }),
  "verify-email": z.strictObject({ token }),
  "reset-password": z.strictObject({ token, newPassword: password }),
  logout: z.strictObject({}),
};
