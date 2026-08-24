import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { createAuthRouter } from "./authRoutes.js";
import { createCaseRouter } from "./caseRoutes.js";
import { createCommunityRouter } from "./communityRoutes.js";
import { ApiError, asyncRoute, errorHandler, notFound } from "./errors.js";
import { issueCsrf, csrfMiddleware, sessionMiddleware } from "./security.js";
import { initMonitoring } from "./monitoring.js";

export function createApp({ db, config, frontendDir } = {}) {
  initMonitoring(config);
  const app = express();
  if (config.trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    req.requestId = req.get("x-request-id") || randomUUID();
    req.startedAt = process.hrtime.bigint();
    res.set("x-request-id", req.requestId);
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - req.startedAt) / 1e6;
      console.log(JSON.stringify({ level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info", event: "http_request", requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationMs * 10) / 10 }));
    });
    next();
  });
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (!origin) return next();
    if (!config.corsAllowedOrigins.includes(origin)) return next(new ApiError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed"));
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, X-Bot-Token, Idempotency-Key, X-Request-Id");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:", config.apiBaseUrl],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", config.apiBaseUrl],
        objectSrc: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.env === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.env === "production" ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }));
  app.use((req, res, next) => {
    res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb", type: ["application/json", "application/*+json"] }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(sessionMiddleware(db, config));
  app.use((req, res, next) => { res.locals.csrfToken = issueCsrf(req, res, config); next(); });
  app.use(csrfMiddleware(config));

  app.get("/api/health/live", (req, res) => res.json({ status: "ok", version: config.deployVersion, timestamp: new Date().toISOString() }));
  app.get("/api/health/ready", asyncRoute(async (req, res) => {
    if (typeof db.ping === "function") await db.ping();
    else await db.prepare("SELECT 1 ready").get();
    res.json({ status: "ready", database: config.databaseProvider, storage: config.storageProvider, version: config.deployVersion, timestamp: new Date().toISOString() });
  }));
  app.get("/api/health", asyncRoute(async (req, res) => {
    if (typeof db.ping === "function") await db.ping();
    else await db.prepare("SELECT 1 ready").get();
    res.json({ status: "ok", environment: config.env, database: config.databaseProvider, version: config.deployVersion, timestamp: new Date().toISOString() });
  }));
  app.use("/api/auth", createAuthRouter({ db, config }));
  app.use("/api/cases", createCaseRouter({ db, config }));
  app.use("/api", createCommunityRouter({ db, config }));

  if (frontendDir && existsSync(frontendDir)) {
    app.use(express.static(frontendDir, { index: false, maxAge: config.env === "production" ? "1h" : 0 }));
    app.get("/{*splat}", (req, res, next) => req.path.startsWith("/api/") ? next() : res.sendFile(path.join(frontendDir, "index.html")));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
