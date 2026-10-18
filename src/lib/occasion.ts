import type { MilestoneType } from "@/types";

const BIRTHDAY = /\b(birthday|bday|b-day|born|birth)\b/i;
const ANNIVERSARY = /\b(anniversary|wedding|married|marriage|nikah|walima|engaged|engagement)\b/i;

/**
 * The occasion a title names, or null when it names none.
 *
 * The form used to ask with three chips, and the only thing the answer changes
 * is wording ("30th birthday" against "30 years on") and whether returns
 * before a birth are hidden. Null leaves the caller's own answer standing, so a
 * title that says nothing never turns a birthday into something else.
 */
export function inferOccasion(title: string): MilestoneType | null {
  if (BIRTHDAY.test(title)) return "birthday";
  if (ANNIVERSARY.test(title)) return "anniversary";
  return null;
}
