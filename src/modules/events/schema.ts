import { z } from "zod";

export const eventTypes = ["haldi", "mehendi", "sangeet", "wedding", "reception", "pre_wedding", "post_wedding", "custom"] as const;
export const eventTypeLabels: Record<(typeof eventTypes)[number], string> = {
  haldi: "Haldi", mehendi: "Mehendi", sangeet: "Sangeet", wedding: "Wedding",
  reception: "Reception", pre_wedding: "Pre-wedding", post_wedding: "Post-wedding", custom: "Custom",
};
const text = z.string().trim().min(1, "Please complete this field.").max(200, "Use 200 characters or fewer.");
const instant = z.iso.datetime({ offset: true }).refine((s) => Number.isFinite(Date.parse(s)), "Choose a valid date and time.");
export const createEventSchema = z.strictObject({
  name: text,
  type: z.enum(eventTypes),
  startsAt: instant,
  endsAt: instant.optional(),
  venue: z.strictObject({
    name: text,
    address: text,
    mapUrl: z.string().trim().max(2000).refine((s) => {
      try { const u = new URL(s); return !/[\u0000-\u001f\u007f]/.test(s) && u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
    }, "Enter a valid HTTPS map link without a username or password.").transform((s) => new URL(s).href).optional(),
  }),
  description: z.string().trim().max(10000).optional(),
  dressCode: text.optional(),
  status: z.literal("draft").default("draft"),
}).superRefine((value, context) => {
  if (value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt))
    context.addIssue({ code: "custom", path: ["endsAt"], message: "End date and time must be after the start." });
});
export type CreateEvent = z.infer<typeof createEventSchema>;

/** Resolve wall-clock input without silently shifting DST gaps or picking a repeated hour. */
export function localEventInstant(date: string, time: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw Error("Enter a complete date and time.");
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== `${date}T${time}`)
    throw Error("Enter a valid date and time.");
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, calendar: "gregory", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  function at(value: number) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map((p) => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`;
  }
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = wall + hours * 3600000;
    offsets.add(Date.parse(at(sample)) - sample);
  }
  const matches = [...offsets].map((offset) => wall - offset).filter((candidate) => at(candidate) === `${date}T${time}:00Z`);
  if (!matches.length) throw Error("This local time does not exist due to a daylight-saving change. Choose another time.");
  if (matches.length > 1) throw Error("This local time occurs twice due to a daylight-saving change. Choose an unambiguous time.");
  return new Date(matches[0]).toISOString();
}

export function eventDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: timezone, dateStyle: "long" }).format(new Date(value));
}
export function eventTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
