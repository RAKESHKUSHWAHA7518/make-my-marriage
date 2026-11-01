import { z } from "zod";
const objectId = z.string().regex(/^[a-f0-9]{24}$/, "Choose a valid saved item.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => v >= "1000-01-01" && v <= "9999-12-31" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Choose a valid date.");
export const websiteDraftSchema = z.strictObject({
  coupleNames: z.string().trim().min(1, "Enter the names to display.").max(403),
  intro: z.string().trim().max(10000),
  date: date.optional(), coverAssetId: objectId.optional(),
  selectedEventIds: z.array(objectId).max(100).refine(v => new Set(v).size === v.length, "Select each event only once."),
  contact: z.strictObject({ name: z.string().trim().min(1).max(200).optional(), email: z.email().max(254).optional(), phone: z.string().trim().min(5).max(40).regex(/^\+?[\d\s().-]+$/).refine(v => v.replace(/\D/g, "").length >= 5).optional() }).refine(v => !!(v.name || v.email || v.phone), "Enter contact information or turn off public contact.").optional(),
});
export const patchWebsiteSchema = z.strictObject({ draft: websiteDraftSchema, expectedDraftVersion: z.number().int().positive() });
export const coverQuerySchema = z.strictObject({ cursor: objectId.optional() });
export const publishWebsiteSchema = z.strictObject({ expectedDraftVersion: z.number().int().positive(), expectedPublishedRevision: z.number().int().nonnegative(), expectedReviewHash: z.string().regex(/^[a-f0-9]{64}$/) });
export const unpublishWebsiteSchema = z.strictObject({ expectedPublishedRevision: z.number().int().positive() });
export type WebsiteDraft = z.infer<typeof websiteDraftSchema>;
