import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadConfig(overrides = {}) {
  const env = overrides.env || process.env.NODE_ENV || "development";
  const origins = (process.env.CORS_ALLOWED_ORIGINS || process.env.APP_ORIGIN || "http://localhost:4173").split(",").map((value) => value.trim()).filter(Boolean);
  const config = {
    env,
    processRole: process.env.PROCESS_ROLE || "api",
    port: Number(process.env.PORT || process.env.API_PORT || 8787),
    databaseProvider: process.env.DATABASE_PROVIDER || "sqlite",
    databasePath: process.env.DATABASE_PATH || path.join(root, "var", "findgeorgia.sqlite"),
    postgresUrl: process.env.POSTGRES_URL || process.env.DATABASE_URL || "",
    postgresSsl: process.env.POSTGRES_SSL !== "false",
    postgresSslRejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED === "true",
    databasePoolMax: Number(process.env.DATABASE_POOL_MAX || 10),
    databaseIdleTimeoutMs: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30_000),
    databaseConnectTimeoutMs: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 10_000),
    storageProvider: process.env.STORAGE_PROVIDER || "filesystem",
    privateStorageDir: process.env.PRIVATE_STORAGE_DIR || path.join(root, "var", "storage", "private"),
    publicMediaDir: process.env.PUBLIC_MEDIA_DIR || path.join(root, "var", "storage", "public"),
    objectStorageEndpoint: process.env.OBJECT_STORAGE_ENDPOINT || "",
    objectStorageRegion: process.env.OBJECT_STORAGE_REGION || "auto",
    objectStorageAccessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID || "",
    objectStorageSecretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || "",
    objectStoragePublicBucket: process.env.OBJECT_STORAGE_PUBLIC_BUCKET || "",
    objectStoragePrivateBucket: process.env.OBJECT_STORAGE_PRIVATE_BUCKET || "",
    backupDir: process.env.BACKUP_DIR || path.join(root, "var", "backups"),
    appOrigin: process.env.APP_ORIGIN || "http://localhost:4173",
    corsAllowedOrigins: origins,
    apiBaseUrl: process.env.API_BASE_URL || "http://localhost:8787",
    publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:4173",
    sessionCookie: process.env.SESSION_COOKIE_NAME || "fg_session",
    csrfCookie: process.env.CSRF_COOKIE_NAME || "fg_csrf",
    sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS || 8 * 60 * 60),
    signedUrlTtlSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS || 120),
    signedUrlSecret: process.env.SIGNED_URL_SECRET || "development-only-change-me",
    dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY || process.env.SIGNED_URL_SECRET || "development-only-change-me",
    botProvider: process.env.BOT_PROVIDER || "development",
    botDevToken: process.env.BOT_DEV_TOKEN || "dev-bot-pass",
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || "",
    turnstileHostname: process.env.TURNSTILE_HOSTNAME || "",
    turnstileAction: process.env.TURNSTILE_ACTION || "public-intake",
    malwareScanner: process.env.MALWARE_SCANNER || "development",
    clamavHost: process.env.CLAMAV_HOST || "127.0.0.1",
    clamavPort: Number(process.env.CLAMAV_PORT || 3310),
    clamavTimeoutMs: Number(process.env.CLAMAV_TIMEOUT_MS || 15_000),
    emailProvider: process.env.EMAIL_PROVIDER || "development",
    resendApiKey: process.env.RESEND_API_KEY || "",
    emailFrom: process.env.EMAIL_FROM || "",
    adminNotificationEmail: process.env.ADMIN_NOTIFICATION_EMAIL || "",
    errorMonitorDsn: process.env.ERROR_MONITOR_DSN || "",
    deployVersion: process.env.RENDER_GIT_COMMIT || process.env.DEPLOY_VERSION || "development",
    trustProxy: process.env.TRUST_PROXY === "true",
    exposeDevHelpers: env === "development" && process.env.EXPOSE_DEV_HELPERS !== "false",
    maxEvidenceBytes: Number(process.env.MAX_EVIDENCE_BYTES || 10 * 1024 * 1024),
    maxPublicImageBytes: Number(process.env.MAX_PUBLIC_IMAGE_BYTES || 5 * 1024 * 1024),
    enableJobs: process.env.ENABLE_BACKGROUND_JOBS === "true",
    allowProductionSeed: process.env.ALLOW_PRODUCTION_SEED === "true",
    adminBootstrapTokenHash: process.env.ADMIN_BOOTSTRAP_TOKEN_HASH || "",
    ...overrides,
  };
  if (env !== "production" && overrides.signedUrlSecret && !overrides.dataEncryptionKey) config.dataEncryptionKey = overrides.signedUrlSecret;

  if (config.env === "production") {
    if (config.signedUrlSecret === "development-only-change-me" || config.signedUrlSecret.length < 32) {
      throw new Error("SIGNED_URL_SECRET must be a strong production secret");
    }
    if (config.botProvider === "development") throw new Error("A production bot-protection provider is required");
    if (!config.appOrigin.startsWith("https://")) throw new Error("APP_ORIGIN must use HTTPS in production");
    if (!config.apiBaseUrl.startsWith("https://")) throw new Error("API_BASE_URL must use HTTPS in production");
    if (config.databaseProvider !== "postgres" || !config.postgresUrl.startsWith("postgres")) throw new Error("Production requires DATABASE_PROVIDER=postgres and POSTGRES_URL");
    if (config.storageProvider !== "s3") throw new Error("Production requires STORAGE_PROVIDER=s3");
    for (const [name, value] of Object.entries({
      OBJECT_STORAGE_ENDPOINT: config.objectStorageEndpoint,
      OBJECT_STORAGE_ACCESS_KEY_ID: config.objectStorageAccessKeyId,
      OBJECT_STORAGE_SECRET_ACCESS_KEY: config.objectStorageSecretAccessKey,
      OBJECT_STORAGE_PUBLIC_BUCKET: config.objectStoragePublicBucket,
      OBJECT_STORAGE_PRIVATE_BUCKET: config.objectStoragePrivateBucket,
      DATA_ENCRYPTION_KEY: config.dataEncryptionKey,
      TURNSTILE_SECRET_KEY: config.turnstileSecretKey,
      TURNSTILE_HOSTNAME: config.turnstileHostname,
    })) if (!value || value === "development-only-change-me") throw new Error(`${name} is required in production`);
    if (config.objectStoragePublicBucket === config.objectStoragePrivateBucket) throw new Error("Public and private object storage buckets must be separate");
    if (config.dataEncryptionKey === config.signedUrlSecret || config.dataEncryptionKey.length < 32) throw new Error("DATA_ENCRYPTION_KEY must be strong and separate from SIGNED_URL_SECRET");
    if (config.malwareScanner !== "clamav") throw new Error("Production requires MALWARE_SCANNER=clamav");
    if (config.emailProvider !== "resend" || !config.resendApiKey || !config.emailFrom || !config.adminNotificationEmail) throw new Error("Production requires configured Resend email delivery");
    if (!config.errorMonitorDsn) throw new Error("ERROR_MONITOR_DSN is required in production");
    if (config.processRole === "api" && !config.adminBootstrapTokenHash) throw new Error("ADMIN_BOOTSTRAP_TOKEN_HASH is required for secure initial administration");
    if (config.exposeDevHelpers || config.allowProductionSeed) throw new Error("Development helpers and demo seeding are forbidden in production");
  }
  return config;
}

export const projectRoot = root;
