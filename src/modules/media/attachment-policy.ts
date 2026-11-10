export const privateAttachmentMaxBytes = 4_000_000;
export const privateAttachmentLimit = 20;
export const attachmentTargets = {
  task_attachment: { collection: "tasks", field: "attachmentAssetIds", context: "taskId", folder: "task-attachments", route: "attachments", label: "Task attachment", action: "task.attachment" },
  receipt: { collection: "expenses", field: "receiptAssetIds", context: "expenseId", folder: "receipts", route: "receipts", label: "Expense receipt", action: "expense.receipt" },
} as const;
export type AttachmentPurpose = keyof typeof attachmentTargets;
export const isPrivateAttachment = (purpose: unknown): purpose is AttachmentPurpose => purpose === "task_attachment" || purpose === "receipt";
export const attachmentFormats = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" } as const;
export type AttachmentFormat = (typeof attachmentFormats)[keyof typeof attachmentFormats];

export function attachmentFormat(contentType: string, filename: string): AttachmentFormat | undefined {
  const format = attachmentFormats[contentType as keyof typeof attachmentFormats];
  const extension = filename.split(".").at(-1)?.toLowerCase();
  if (!format || !filename.includes(".") || (extension !== format && !(format === "jpg" && extension === "jpeg"))) return;
  return format;
}
