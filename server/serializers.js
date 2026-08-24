const stateLabels = { DRAFT: "Draft", PUBLISHED: "Published", UNPUBLISHED: "Unpublished", FOUND: "Found", CLOSED: "Closed", ARCHIVED: "Archived" };

function names(row) { return { ka: row.name_ka, en: row.name_en }; }
function localized(ka, en) { return { ka, en }; }

export function publicCaseDTO(row) {
  const status = row.admin_status || row.state;
  const minimal = ["FOUND", "CLOSED"].includes(status);
  return {
    id: row.public_case_id,
    publicCaseId: row.public_case_id,
    name: names(row),
    sex: row.sex || null,
    dateOfBirth: row.date_of_birth || null,
    age: row.age,
    region: minimal ? undefined : localized(row.region_ka || row.broad_location_ka, row.region_en || row.broad_location_en),
    municipality: minimal ? undefined : localized(row.municipality_ka || row.location_ka, row.municipality_en || row.location_en),
    location: minimal ? undefined : localized(row.location_ka, row.location_en),
    broadLocation: minimal ? undefined : localized(row.region_ka || row.broad_location_ka, row.region_en || row.broad_location_en),
    missingDate: minimal ? undefined : localized(row.missing_date_ka, row.missing_date_en),
    missingTime: minimal ? undefined : row.missing_time,
    lastVerifiedAt: localized(row.last_verified_ka, row.last_verified_en),
    lastUpdatedAt: row.updated_at,
    publishedAt: row.published_at,
    foundAt: row.found_at,
    verificationStatus: stateLabels[status],
    status: status === "PUBLISHED" ? "Missing" : stateLabels[status],
    privacyReviewStatus: minimal ? row.privacy_review_status : "Not Required",
    image: minimal ? undefined : row.public_image_url,
    publicPhoto: minimal ? undefined : row.public_image_url,
    story: minimal ? undefined : localized(row.story_ka, row.story_en),
    publicDescription: minimal ? undefined : localized(row.story_ka, row.story_en),
    indexing: row.indexing_policy,
  };
}

export function adminCaseDTO(row, { includeEvidence = false } = {}) {
  return {
    ...publicCaseDTO(row),
    adminImageUrl: row.public_image_storage_key ? `/api/cases/admin/${row.id}/public-image-file` : null,
    internalId: row.id,
    adminStatus: row.admin_status,
    version: Number(row.version),
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    sourceNote: row.source_note,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    adminNotes: row.admin_notes,
    unpublishedAt: row.unpublished_at,
    closedAt: row.closed_at,
    archivedAt: row.archived_at,
    evidence: includeEvidence ? row.evidence || [] : undefined,
  };
}

export function tipDTO(row) {
  return {
    id: row.reference_code,
    internalId: row.id,
    caseId: row.public_case_id,
    tipType: row.tip_type,
    firstHand: Boolean(row.first_hand),
    occurredDate: row.occurred_at?.slice(0, 10) || "",
    occurredTime: row.occurred_at?.slice(11, 16) || "",
    unknownTime: Boolean(row.unknown_time),
    location: row.location_text,
    municipality: row.municipality,
    confidence: row.confidence,
    description: row.description,
    attachment: row.attachment_count ? "private attachment available" : null,
    reporterContact: Boolean(row.reporter_contact_encrypted),
    informationQuality: row.information_quality,
    moderationStatus: row.moderation_status,
    fraudStatus: row.fraud_status,
    safetyFlags: row.risk_signals || [],
    createdAt: row.created_at,
  };
}
