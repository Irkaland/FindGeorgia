import { ApiError } from "./errors.js";

export const CASE_STATES = ["DRAFT", "PUBLISHED", "UNPUBLISHED", "FOUND", "CLOSED", "ARCHIVED"];

export const CASE_TRANSITIONS = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["UNPUBLISHED", "FOUND"],
  UNPUBLISHED: ["PUBLISHED", "ARCHIVED"],
  FOUND: ["CLOSED"],
  CLOSED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function assertTransition(from, to) {
  if (!CASE_STATES.includes(to)) throw new ApiError(422, "VALIDATION_ERROR", "Unknown case state");
  if (!CASE_TRANSITIONS[from]?.includes(to)) {
    throw new ApiError(409, "INVALID_STATE_TRANSITION", `Case cannot transition from ${from} to ${to}`);
  }
}
