import { ZodError } from "zod";
import { ApiError } from "./errors.js";

export function parse(schema, value) {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(422, "VALIDATION_ERROR", "Please correct the highlighted information", error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
    }
    throw error;
  }
}
