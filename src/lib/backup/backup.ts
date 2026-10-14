import type { Milestone, MilestoneLocation, MilestoneType } from "@/types";

/**
 * A FILE OF ONE'S RECORDS, out through the share sheet and back in.
 *
 * Everything lives in AsyncStorage on one phone, and the app has no account to
 * sync it. Losing the phone, or deleting the app, used to lose every date
 * anyone had typed. A backup is a plain JSON file the person keeps wherever
 * they keep files, and restoring one adds what is missing and never overwrites
 * what is already there.
 *
 * Pure, so the reading is tested: a backup file is input from outside the app,
 * and nothing in it reaches the store until every field has been checked.
 */

export const BACKUP_FORMAT = "trace-records";
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  milestones: Milestone[];
  /** Ids of the records whose reminder bell was on. */
  reminders: string[];
}

export function makeBackup(
  milestones: readonly Milestone[],
  reminders: readonly string[],
  now: Date = new Date()
): Backup {
  const ids = new Set(milestones.map((m) => m.id));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    milestones: [...milestones],
    reminders: reminders.filter((id) => ids.has(id)),
  };
}

const TYPES: readonly MilestoneType[] = ["birthday", "anniversary", "graduation", "custom"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function readLocation(v: unknown): MilestoneLocation | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isObject(v)) return undefined;
  const { latitude, longitude, label, timezoneOffsetMin } = v;
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) return undefined;
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) return undefined;
  if (typeof label !== "string") return undefined;
  if (timezoneOffsetMin !== undefined && !isFiniteNumber(timezoneOffsetMin)) return undefined;
  return {
    latitude,
    longitude,
    label,
    ...(timezoneOffsetMin !== undefined ? { timezoneOffsetMin } : {}),
  };
}

function readMilestone(v: unknown): Milestone | null {
  if (!isObject(v)) return null;
  const { id, title, type, date, notes, createdAt } = v;
  if (typeof id !== "string" || !id) return null;
  if (typeof title !== "string" || !title.trim()) return null;
  if (typeof type !== "string" || !TYPES.includes(type as MilestoneType)) return null;
  if (typeof date !== "string" || !DATE.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) return null;
  if (notes !== undefined && typeof notes !== "string") return null;
  const location = readLocation(v.location);
  if (location === undefined) return null;
  const note = typeof notes === "string" ? notes.trim() : "";
  return {
    id,
    title: title.trim(),
    type: type as MilestoneType,
    date,
    location,
    ...(note ? { notes: note } : {}),
    createdAt: typeof createdAt === "string" ? createdAt : new Date().toISOString(),
  };
}

export type ReadBackupResult =
  | { ok: true; milestones: Milestone[]; reminders: string[]; skipped: number }
  | { ok: false; reason: string };

/** Reads a backup file's text. Records that fail a check are skipped and counted. */
export function readBackup(text: string): ReadBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file is not a TRACE backup. It is not readable as one." };
  }
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT || !Array.isArray(raw.milestones)) {
    return { ok: false, reason: "That file is not a TRACE backup." };
  }
  if (!isFiniteNumber(raw.version) || raw.version > BACKUP_VERSION) {
    return { ok: false, reason: "That backup comes from a newer version of TRACE. Update the app and try again." };
  }
  const milestones: Milestone[] = [];
  let skipped = 0;
  for (const item of raw.milestones) {
    const m = readMilestone(item);
    if (m) milestones.push(m);
    else skipped++;
  }
  const reminders = Array.isArray(raw.reminders)
    ? raw.reminders.filter((id): id is string => typeof id === "string")
    : [];
  return { ok: true, milestones, reminders, skipped };
}

/**
 * The records a restore adds: the ones not already on the phone. A record
 * with the same id is the same record, and the copy on the phone wins, because
 * it may have been edited since the backup was made.
 */
export function newRecords(existing: readonly Milestone[], incoming: readonly Milestone[]): Milestone[] {
  const have = new Set(existing.map((m) => m.id));
  const seen = new Set<string>();
  return incoming.filter((m) => {
    if (have.has(m.id) || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}
