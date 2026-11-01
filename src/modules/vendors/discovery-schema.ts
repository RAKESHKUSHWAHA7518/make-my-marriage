import { z } from "zod";
import { vendorCategories, googlePlaceIdSchema } from "./schema";

export const discoveryQuerySchema = z.strictObject({
  category: z.enum(vendorCategories, { message: "Choose a vendor category." }),
  location: z.string().trim().min(2, "Enter a city or area.").max(200).refine(v => !/[\p{Cc}\p{Cf}]/u.test(v), "Enter a valid city or area."),
  cursor: z.string().min(1).max(6000).optional(),
});
export const placeQuerySchema = z.strictObject({ placeId: googlePlaceIdSchema });
export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;
export type DiscoveredPlace = {
  placeId: string; name: string; address?: string; typeLabel?: string;
  rating?: number; reviewCount?: number; businessStatus?: string;
  mapsUrl?: string; phone?: string; websiteUrl?: string;
  attributions: { name: string; uri: string }[];
  savedVendor?: { id: string; status: "active" | "removed" };
};
export type DiscoveryPage = { data: DiscoveredPlace[]; pagination: { nextCursor: string | null } };
