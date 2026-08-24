import { ApiError } from "./errors.js";

export const CASE_SELECT = `SELECT c.*, mp.name_ka, mp.name_en, mp.age, u.email owner_email, u.phone owner_phone,
  (SELECT COUNT(*) FROM case_updates cu WHERE cu.case_id = c.id AND cu.status = 'PENDING') pending_update_count
  FROM cases c JOIN missing_people mp ON mp.id = c.missing_person_id JOIN users u ON u.id = c.owner_user_id`;

export async function getCase(db, identifier, { forUpdate = false } = {}) {
  const lock = forUpdate && db.dialect === "postgres" ? " FOR UPDATE OF c" : "";
  const row = await db.prepare(`${CASE_SELECT} WHERE c.id = ? OR c.public_case_id = ? LIMIT 1${lock}`).get(identifier, identifier);
  if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Case not found");
  return row;
}

export async function listModeratorCases(db, { state, limit = 50, offset = 0 } = {}) {
  const where = state ? " WHERE c.admin_status = ?" : "";
  const params = state ? [state, limit, offset] : [limit, offset];
  return db.prepare(`${CASE_SELECT}${where} ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`).all(...params);
}

export async function listPublicCases(db, { status = "active", region, municipality, sex, ageMin, ageMax, missingYear, query, limit = 20, offset = 0 } = {}) {
  const clauses = [];
  const params = [];
  if (status === "active") clauses.push("c.admin_status = 'PUBLISHED'");
  else if (status === "found") clauses.push("c.admin_status IN ('FOUND','CLOSED')");
  else clauses.push("c.admin_status IN ('PUBLISHED','FOUND','CLOSED')");
  if (region) { clauses.push("(c.region_en = ? OR c.region_ka = ?)"); params.push(region, region); }
  if (municipality) { clauses.push("(c.municipality_en = ? OR c.municipality_ka = ?)"); params.push(municipality, municipality); }
  if (sex) { clauses.push("c.sex = ?"); params.push(sex); }
  if (ageMin !== undefined) { clauses.push("mp.age >= ?"); params.push(ageMin); }
  if (ageMax !== undefined) { clauses.push("mp.age <= ?"); params.push(ageMax); }
  if (missingYear) { clauses.push("(c.missing_date_en LIKE ? OR c.missing_date_ka LIKE ?)"); params.push(`%${missingYear}%`, `%${missingYear}%`); }
  if (query) { clauses.push("(mp.name_en LIKE ? OR mp.name_ka LIKE ? OR c.public_case_id LIKE ?)"); const q = `%${query.slice(0, 80)}%`; params.push(q, q, q); }
  const where = `WHERE ${clauses.join(" AND ")}`;
  const rows = await db.prepare(`${CASE_SELECT} ${where} ORDER BY COALESCE(c.published_at, c.found_at) DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const total = (await db.prepare(`SELECT COUNT(*) count FROM cases c JOIN missing_people mp ON mp.id = c.missing_person_id ${where}`).get(...params)).count;
  return { rows, total: Number(total) };
}

export const TIP_SELECT = `SELECT t.*, c.public_case_id,
  (SELECT COUNT(*) FROM tip_attachments ta WHERE ta.tip_id = t.id AND ta.removed_at IS NULL) attachment_count
  FROM tips t JOIN cases c ON c.id = t.case_id`;

export async function listTips(db, { status, limit = 50, offset = 0 } = {}) {
  const where = status ? " WHERE t.moderation_status = ?" : "";
  const params = status ? [status, limit, offset] : [limit, offset];
  const rows = await db.prepare(`${TIP_SELECT}${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`).all(...params);
  for (const row of rows) row.risk_signals = (await db.prepare("SELECT signal_type FROM risk_signals WHERE resource_type = 'TIP' AND resource_id = ? AND status = 'OPEN'").all(row.id)).map((item) => item.signal_type);
  return rows;
}

export async function getTip(db, idOrReference) {
  const row = await db.prepare(`${TIP_SELECT} WHERE t.id = ? OR t.reference_code = ? LIMIT 1`).get(idOrReference, idOrReference);
  if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Tip not found");
  row.risk_signals = (await db.prepare("SELECT signal_type FROM risk_signals WHERE resource_type = 'TIP' AND resource_id = ? AND status = 'OPEN'").all(row.id)).map((item) => item.signal_type);
  return row;
}

export async function evidenceForCase(db, caseId) {
  return db.prepare("SELECT id, original_name, detected_mime, size_bytes, scan_status, created_at FROM case_evidence WHERE case_id = ? AND removed_at IS NULL ORDER BY created_at DESC").all(caseId);
}
