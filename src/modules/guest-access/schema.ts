import { z } from "zod";
export const exchangeSchema = z.strictObject({ kind: z.literal("household"), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export const rotateLinkSchema = z.strictObject({ expectedLinkVersion: z.number().int().positive() });
export const rsvpSchema = z.strictObject({
  status: z.enum(["attending", "not_attending", "maybe"]), attendeeCount: z.number().int().min(0).max(2147483647),
  expectedVersion: z.number().int().positive(), expectedInvitationRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((value, ctx) => {
  if (value.status === "attending" ? value.attendeeCount < 1 : value.attendeeCount !== 0) ctx.addIssue({ code: "custom", path: ["attendeeCount"], message: value.status === "attending" ? "Include at least yourself." : "This response must have a count of zero." });
});
export const responseLabels = { pending: "Pending", attending: "Attending", not_attending: "Not attending", maybe: "Maybe" };
