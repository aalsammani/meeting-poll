/**
 * Client-side validation. The Edge Function and the database re-validate
 * everything; this exists to give people immediate, specific feedback.
 */
import { isValidTimeZone } from "./time";
import type { NewPollInput } from "./types";

export const LIMITS = {
  title: 160,
  description: 2000,
  name: 80,
  email: 254,
  minDuration: 5,
  maxDuration: 1440,
  maxSlots: 60,
} as const;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function cleanText(value: string, max: number): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function validateParticipant(name: string, email: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (cleanText(name, LIMITS.name).length === 0) errors.name = "Please enter your name.";
  const e = email.trim();
  if (e && !EMAIL_RE.test(e)) errors.email = "That email address doesn't look right.";
  if (e.length > LIMITS.email) errors.email = "That email address is too long.";
  return errors;
}

export function validateNewPoll(input: NewPollInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (cleanText(input.title, LIMITS.title).length === 0) errors.title = "Give the meeting a title.";
  if (input.description.length > LIMITS.description) {
    errors.description = `Keep the description under ${LIMITS.description} characters.`;
  }
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < LIMITS.minDuration ||
    input.durationMinutes > LIMITS.maxDuration
  ) {
    errors.durationMinutes = `Duration must be between ${LIMITS.minDuration} minutes and 24 hours.`;
  }
  if (!isValidTimeZone(input.timeZone)) errors.timeZone = "Choose a valid time zone.";
  if (input.slotStartsAt.length === 0) errors.slots = "Add at least one proposed time.";
  if (input.slotStartsAt.length > LIMITS.maxSlots) errors.slots = `Keep it to ${LIMITS.maxSlots} proposed times or fewer.`;
  if (new Set(input.slotStartsAt).size !== input.slotStartsAt.length) errors.slots = "Two proposed times are identical.";
  if (input.deadline && Number.isNaN(new Date(input.deadline).getTime())) errors.deadline = "The deadline is not a valid date.";
  return errors;
}
