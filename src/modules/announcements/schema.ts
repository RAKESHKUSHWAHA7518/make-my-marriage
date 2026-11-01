import { z } from "zod";
const title = z.string().trim().min(1, "Announcement title is required.").max(200, "Use at most 200 characters.");
const body = z.string().trim().min(1, "Message is required.").max(10000, "Use at most 10,000 characters.");
export const createAnnouncementSchema = z.strictObject({ title, body, pinned: z.boolean().default(false) });
export const patchAnnouncementSchema = z.strictObject({ title: title.optional(), body: body.optional(), pinned: z.boolean().optional(), expectedVersion: z.number().int().positive() }).refine(v => v.title !== undefined || v.body !== undefined || v.pinned !== undefined, "Provide changes to save.");
export const removeAnnouncementSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
export const announcementQuerySchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(25), cursor: z.string().min(1).max(2500).optional() });
