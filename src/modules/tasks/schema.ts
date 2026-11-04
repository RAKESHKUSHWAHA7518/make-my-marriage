import { z } from "zod";
export const taskStatuses = ["todo", "in_progress", "done", "cancelled"] as const;
export const taskPriorities = ["low", "normal", "high"] as const;
export const taskStatusLabels = { todo: "To do", in_progress: "In progress", done: "Done", cancelled: "Cancelled" };
export const taskPriorityLabels = { low: "Low", normal: "Normal", high: "High" };
const id = z.string().regex(/^[a-f0-9]{24}$/, "Choose an available option.");
export const checklistItemSchema = z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Use a valid checklist item ID."), text: z.string().trim().min(1, "Enter a checklist item or remove this row.").max(500, "Use at most 500 characters."), done: z.boolean() });
export const checklistSchema = z.array(checklistItemSchema).max(100, "You can add up to 100 checklist items.").refine(items => new Set(items.map(i => i.id)).size === items.length, "Checklist items must have unique IDs.");
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
const fields = z.strictObject({
  title: z.string().trim().min(1, "Enter a task title.").max(200),
  description: z.string().trim().max(10000).optional(),
  status: z.enum(taskStatuses), priority: z.enum(taskPriorities),
  eventId: id.optional(), assigneeUserId: id.optional(),
  dueAt: z.iso.datetime({ offset: true }).optional(),
  checklist: checklistSchema.optional(),
});
export const createTaskSchema = fields.extend({ status: z.enum(taskStatuses).default("todo"), priority: z.enum(taskPriorities).default("normal") });
export const patchTaskSchema = fields.partial().extend({
  expectedVersion: z.number().int().positive(), description: fields.shape.description.nullable(),
  eventId: id.nullable().optional(), assigneeUserId: id.nullable().optional(), dueAt: fields.shape.dueAt.nullable(),
}).refine((v) => Object.keys(v).some((key) => key !== "expectedVersion"), "Supply at least one editable field.");
export function taskOverdue(task: { dueAt?: string; status: string }, now: Date) {
  return !!task.dueAt && ["todo", "in_progress"].includes(task.status) && Date.parse(task.dueAt) < now.getTime();
}
