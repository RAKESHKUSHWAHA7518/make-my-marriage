import { z } from "zod";

export const vendorCategories = ["venue", "catering", "photography", "decoration", "mehendi", "priest", "clothing", "other"] as const;
export const vendorCategoryLabels = { venue: "Venue", catering: "Catering", photography: "Photography", decoration: "Decoration", mehendi: "Mehendi", priest: "Priest", clothing: "Clothing", other: "Other" };
export const googlePlaceIdSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/, "Choose a valid business.");
export const googleVendorFallbackName = "Saved Google business";
const text = z.string().trim().min(1, "Complete this field.").max(200);
const objectId = z.string().regex(/^[a-f0-9]{24}$/);
export const vendorContactSchema = z.strictObject({
  person: text.optional(),
  phone: z.string().trim().min(5).max(40).regex(/^\+?[\d\s().-]+$/, "Enter a valid phone number.").refine(v => v.replace(/\D/g, "").length >= 5, "Enter a valid phone number.").optional(),
  email: z.email({ message: "Enter a valid email address." }).max(254).optional(),
  address: z.string().trim().min(1).max(2000).optional(),
});
const fields = z.strictObject({ name: text, category: z.enum(vendorCategories, { message: "Choose a vendor category." }), contact: vendorContactSchema.optional(), eventIds: z.array(objectId).max(100).refine(v => new Set(v).size === v.length, "Select each event only once."), notes: z.string().trim().max(10000).optional() });
export const createVendorSchema = z.discriminatedUnion("source", [
  fields.extend({ source: z.literal("MANUAL") }),
  fields.extend({ source: z.literal("GOOGLE_PLACES"), googlePlaceId: googlePlaceIdSchema, name: text.optional() }),
]);
export const patchVendorSchema = fields.partial().extend({ contact: vendorContactSchema.nullable().optional(), notes: z.string().trim().max(10000).nullable().optional(), expectedVersion: z.number().int().positive() }).refine(v => Object.keys(v).some(k => k !== "expectedVersion"), "Supply at least one change.");
export const removeVendorSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
export const vendorQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(), category: z.enum(vendorCategories).optional(), source: z.enum(["MANUAL", "GOOGLE_PLACES"]).optional(),
  eventId: z.union([objectId, z.literal("none")]).optional(), status: z.enum(["active", "removed"]).default("active"),
  limit: z.coerce.number().int().min(1).max(50).default(25), cursor: z.string().max(2500).optional(),
});
