import { z } from "zod";

export const householdSides = ["bride", "groom", "both", "other"] as const;
export const rsvpStatuses = ["pending", "attending", "not_attending", "maybe"] as const;
export const objectId = z.string().regex(/^[a-f0-9]{24}$/, "Choose a valid record.");
const contact = z.strictObject({
  name: z.string().trim().min(1, "Enter the representative’s name.").max(200),
  email: z.string().trim().pipe(z.email().max(254)).optional(),
  phone: z.string().trim().min(5).max(40).regex(/^\+?[0-9 ()\-\.]+$/, "Enter a valid phone number, including the country code when known.").refine(v => v.replace(/\D/g, "").length >= 5, "Enter a valid phone number.").optional(),
});
export const createHouseholdSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(200),
  representative: contact,
  side: z.enum(householdSides).default("other"),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  maxGuests: z.number().int().min(1, "Party size must include at least the representative.").max(2147483647),
  invitedEventIds: z.array(objectId).min(1, "Select at least one celebration.").max(100).refine(v => new Set(v).size === v.length, "Select each event only once."),
  notes: z.string().trim().max(10000).optional(),
});
// Contact replacement clears omitted optional email/phone. Other omitted fields remain unchanged.
export const patchHouseholdSchema = createHouseholdSchema.partial().extend({
  side: createHouseholdSchema.shape.side.removeDefault().optional(),
  tags: createHouseholdSchema.shape.tags.removeDefault().optional(),
  notes: createHouseholdSchema.shape.notes.nullable(),
  expectedVersion: z.number().int().positive(),
}).refine(v => Object.keys(v).some(k => k !== "expectedVersion"), "Supply changes to save.");
export const removeHouseholdSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
export const householdQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  eventId: objectId.optional(),
  rsvpStatus: z.enum(rsvpStatuses).optional(),
  status: z.enum(["active", "removed"]).default("active"),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().max(2500).optional(),
});
