# Storage

Production uses two Cloudflare R2 buckets through the S3 API:

- Public bucket: sanitized case images only. Public media can be served through the API or a controlled custom domain; never use the rate-limited `r2.dev` endpoint for production.
- Private bucket: tip attachments, quarantine objects, and other sensitive evidence. Public access is disabled. The API authorizes the signed-link request, records a sensitive-access event, and returns a short-lived S3 presigned GET URL.

## Upload pipeline

1. Multer holds a bounded upload in memory.
2. `file-type` verifies actual bytes against the declared MIME and allowed list.
3. The object is written under the private `quarantine/` prefix with `scan=pending` metadata.
4. ClamAV scans the exact bytes through its private TCP service. Timeout, connection failure, malformed response, or unavailable scanner fails closed with `503`; detected malware returns a controlled rejection.
5. A clean object is written to its final public/private key with `scan=clean`; quarantine is deleted. Public images are decoded, rotated, and re-encoded with Sharp before final storage to strip metadata.
6. The database attachment row is committed with `scan_status=CLEAN`. Download queries require that state.

Configure a short lifecycle for `quarantine/` as defense in depth, bucket-scoped tokens with only required actions, and bucket locks where retention policy requires deletion protection. Presigned URLs are bearer tokens; the configured default is 120 seconds. CORS on the private bucket is unnecessary for GET presigned URLs opened directly and must never grant list access.

Recovery requires both database and object integrity. Scheduled inventory checks should report missing referenced keys, unexpected private keys, and quarantine objects older than the scanner timeout/lifecycle window.
