import { z } from "zod";

export const backupSettingsSchema = z
  .object({
    enabled: z.boolean(),
    intervalHours: z.number().int().min(1).max(168),
    retain: z.number().int().min(1).max(30),
  })
  .strict();
export type BackupSettings = z.infer<typeof backupSettingsSchema>;
export type BackupStatus = {
  settings: BackupSettings;
  files: { name: string; createdAt: string; bytes: number }[];
  lastError: string;
};
export const defaultBackupSettings: BackupSettings = {
  enabled: true,
  intervalHours: 24,
  retain: 7,
};
