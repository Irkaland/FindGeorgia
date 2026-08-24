export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFound(req, res) {
  res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Resource not found" } });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
  if (status >= 500) {
    console.error(JSON.stringify({ level: "error", event: "request_failed", code, path: req.path, requestId: req.requestId }));
    captureException(error, { requestId: req.requestId, path: req.path });
  }
  res.status(status).json({ error: { code, message: error instanceof ApiError ? error.message : "The request could not be completed", ...(error.details ? { details: error.details } : {}) }, requestId: req.requestId });
}
import { captureException } from "./monitoring.js";
