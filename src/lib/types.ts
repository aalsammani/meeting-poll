export type AvailabilityState = "yes" | "maybe";
export type PollStatus = "open" | "closed";

export interface PublicPoll {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  timeZone: string;
  deadline: string | null;
  status: PollStatus;
  allowMaybe: boolean;
}

export interface TimeSlot {
  id: string;
  startsAt: string; // ISO 8601, UTC
}

/** A participant's response as exposed publicly (no email). */
export interface PublicResponse {
  id: string;
  name: string;
  updatedAt: string;
  availability: Record<string, AvailabilityState>;
}

export interface PublicPollBundle {
  poll: PublicPoll;
  slots: TimeSlot[];
  responses: PublicResponse[];
}

/** Organizer-only view of a response (includes email). */
export interface OrganizerResponse extends PublicResponse {
  email: string | null;
  createdAt: string;
}

export interface PollOverview {
  id: string;
  title: string;
  status: PollStatus;
  timeZone: string;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  responseCount: number;
  lastResponseAt: string | null;
  slotCount: number;
}

export interface NewPollInput {
  title: string;
  description: string;
  durationMinutes: number;
  timeZone: string;
  deadline: string | null; // ISO UTC or null
  allowMaybe: boolean;
  slotStartsAt: string[]; // ISO UTC
}
