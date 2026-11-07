import { z } from "zod";

export const profileSettingsSchema = z.object({
  fullName: z.string().trim().min(2, "Enter at least 2 characters.").max(200),
});

export const workspaceSettingsSchema = z.object({
  name: z.string().trim().min(1, "Enter a workspace name.").max(120),
  reportingCurrency: z.string().trim().regex(/^[A-Z]{3}$/, "Enter a three-letter currency code in uppercase."),
  reportingTimezone: z.string().trim().min(1, "Enter a reporting time zone.").max(100),
});

export type ProfileSettingsInput = z.infer<typeof profileSettingsSchema>;
export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsSchema>;
