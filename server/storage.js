import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { ApiError } from "./errors.js";
import { signValue } from "./security.js";

const allowedPrivate = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4"]);
const allowedPublic = new Set(["image/jpeg", "image/png", "image/webp"]);
let cachedS3;
let cachedS3Identity;

function s3(config) {
  const identity = `${config.objectStorageEndpoint}|${config.objectStorageAccessKeyId}`;
  if (!cachedS3 || cachedS3Identity !== identity) {
    cachedS3Identity = identity;
    cachedS3 = new S3Client({
      endpoint: config.objectStorageEndpoint,
      region: config.objectStorageRegion,
      forcePathStyle: false,
      credentials: { accessKeyId: config.objectStorageAccessKeyId, secretAccessKey: config.objectStorageSecretAccessKey },
    });
  }
  return cachedS3;
}

export async function inspectUpload(buffer, declaredMime, kind, config) {
  const max = kind === "public" ? config.maxPublicImageBytes : config.maxEvidenceBytes;
  if (!buffer?.length || buffer.length > max) throw new ApiError(422, "FILE_REJECTED", `File must be between 1 byte and ${Math.floor(max / 1024 / 1024)} MB`);
  const detected = await fileTypeFromBuffer(buffer);
  const mime = detected?.mime;
  const allowed = kind === "public" ? allowedPublic : allowedPrivate;
  if (!mime || !allowed.has(mime)) throw new ApiError(422, "FILE_REJECTED", "The file content is not an allowed type");
  if (declaredMime && declaredMime !== "application/octet-stream" && declaredMime !== mime) throw new ApiError(422, "FILE_REJECTED", "The declared and detected file types do not match");
  return { mime, extension: detected.ext, sha256: createHash("sha256").update(buffer).digest("hex") };
}

export async function scanUpload(buffer, config) {
  if (config.malwareScanner === "development") {
    if (buffer.includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"))) throw new ApiError(422, "FILE_INFECTED", "The file did not pass the malware check");
    return { status: "CLEAN", engine: "development-eicar" };
  }
  if (config.malwareScanner !== "clamav") throw new ApiError(503, "MALWARE_SCANNER_UNAVAILABLE", "Uploads are paused because the malware scanner is unavailable");
  return scanWithClamAv(buffer, config);
}

function scanWithClamAv(buffer, config) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.clamavHost, port: config.clamavPort });
    let response = "";
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error instanceof ApiError ? error : new ApiError(503, "MALWARE_SCANNER_UNAVAILABLE", "Uploads are paused because the malware scanner is unavailable"));
    };
    socket.setTimeout(config.clamavTimeoutMs, () => fail(new Error("ClamAV timeout")));
    socket.on("error", fail);
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
        const chunk = buffer.subarray(offset, Math.min(offset + 64 * 1024, buffer.length));
        const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length);
        socket.write(size); socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => { response += chunk.toString("utf8"); });
    socket.on("end", () => {
      if (settled) return;
      settled = true;
      if (/FOUND/i.test(response)) return reject(new ApiError(422, "FILE_INFECTED", "The file did not pass the malware check"));
      if (!/OK/i.test(response)) return reject(new ApiError(503, "MALWARE_SCANNER_UNAVAILABLE", "Uploads are paused because the malware scanner returned an invalid result"));
      resolve({ status: "CLEAN", engine: "clamav" });
    });
  });
}

export async function sanitizePublicImage(buffer, mime) {
  const image = sharp(buffer, { failOn: "error" }).rotate();
  if (mime === "image/png") return image.png().toBuffer();
  if (mime === "image/webp") return image.webp({ quality: 88 }).toBuffer();
  return image.jpeg({ quality: 90 }).toBuffer();
}

export async function persistObject(buffer, kind, extension, config, contentType = "application/octet-stream") {
  const objectKey = `${kind}/${randomUUID()}.${extension}`;
  return persistObjectAtKey(buffer, kind, objectKey, extension, config, contentType);
}

export async function persistMigratedObject(buffer, kind, objectKey, config, contentType = "application/octet-stream") {
  if (!objectKey.startsWith(`${kind}/`) || objectKey.includes("..") || objectKey.includes("\\")) throw new Error("Unsafe migrated object key");
  const extension = path.extname(objectKey).slice(1) || "bin";
  return persistObjectAtKey(buffer, kind, objectKey, extension, config, contentType);
}

async function persistObjectAtKey(buffer, kind, objectKey, extension, config, contentType) {
  const quarantineKey = `quarantine/${randomUUID()}.${extension}`;
  if (config.storageProvider === "s3") {
    const client = s3(config);
    await client.send(new PutObjectCommand({ Bucket: config.objectStoragePrivateBucket, Key: quarantineKey, Body: buffer, ContentType: contentType, Metadata: { scan: "pending" } }));
    try {
      const scan = await scanUpload(buffer, config);
      const bucket = kind === "public" ? config.objectStoragePublicBucket : config.objectStoragePrivateBucket;
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: buffer, ContentType: contentType, Metadata: { scan: "clean" } }));
      await client.send(new DeleteObjectCommand({ Bucket: config.objectStoragePrivateBucket, Key: quarantineKey }));
      return { key: objectKey, bucket, scanStatus: scan.status };
    } catch (error) {
      await client.send(new DeleteObjectCommand({ Bucket: config.objectStoragePrivateBucket, Key: quarantineKey })).catch(() => {});
      throw error;
    }
  }

  const storageRoot = kind === "public" ? config.publicMediaDir : config.privateStorageDir;
  const quarantineRoot = path.join(config.privateStorageDir, "quarantine");
  await mkdir(storageRoot, { recursive: true });
  await mkdir(quarantineRoot, { recursive: true });
  const quarantinePath = path.join(quarantineRoot, path.basename(quarantineKey));
  const absolute = path.join(storageRoot, path.basename(objectKey));
  await writeFile(quarantinePath, buffer, { flag: "wx" });
  try {
    const scan = await scanUpload(buffer, config);
    await rename(quarantinePath, absolute);
    return { key: objectKey, absolute, scanStatus: scan.status };
  } catch (error) {
    await rm(quarantinePath, { force: true }).catch(() => {});
    throw error;
  }
}

async function readObject(storageKey, kind, config) {
  if (config.storageProvider === "s3") {
    const bucket = kind === "public" ? config.objectStoragePublicBucket : config.objectStoragePrivateBucket;
    const result = await s3(config).send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
    return Buffer.from(await result.Body.transformToByteArray());
  }
  const storageRoot = kind === "public" ? config.publicMediaDir : config.privateStorageDir;
  return readFile(path.join(storageRoot, path.basename(storageKey)));
}

export const readPrivateObject = (storageKey, config) => readObject(storageKey, "private", config);
export const readPublicObject = (storageKey, config) => readObject(storageKey, "public", config);

export async function privateDownloadUrl(storageKey, config) {
  if (config.storageProvider !== "s3") return null;
  return getSignedUrl(s3(config), new GetObjectCommand({ Bucket: config.objectStoragePrivateBucket, Key: storageKey }), { expiresIn: config.signedUrlTtlSeconds });
}

export async function checkStorage(config) {
  if (config.storageProvider !== "s3") return { provider: "filesystem", ready: true };
  const client = s3(config);
  await Promise.all([
    client.send(new HeadBucketCommand({ Bucket: config.objectStoragePublicBucket })),
    client.send(new HeadBucketCommand({ Bucket: config.objectStoragePrivateBucket })),
  ]);
  return { provider: "s3", ready: true, bucketsSeparated: config.objectStoragePublicBucket !== config.objectStoragePrivateBucket };
}

export function signedDownloadToken(resourceId, expiresAt, config) {
  return signValue(resourceId, expiresAt, config.signedUrlSecret);
}

export function verifySignedDownload(resourceId, expiresAt, signature, config) {
  if (!signature || !expiresAt || Number(expiresAt) < Date.now()) throw new ApiError(403, "SIGNED_URL_EXPIRED", "The private file link has expired");
  const expected = signedDownloadToken(resourceId, expiresAt, config);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new ApiError(403, "FORBIDDEN", "The private file link is invalid");
}
