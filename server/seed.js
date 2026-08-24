import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_PERMISSIONS, PERMISSIONS, ROLES } from "./permissions.js";
import { encryptSensitive, hashPassword, isoNow, opaqueId } from "./security.js";

export const DEMO_PASSWORD = "FindGeorgia!2026";
export const DEMO_MFA_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

const users = [
  ["10000000-0000-4000-8000-000000000004", "moderator@example.test", null, "ADMIN"],
  ["10000000-0000-4000-8000-000000000003", "tip.reviewer@example.test", null, "TIP_REVIEWER"],
  ["10000000-0000-4000-8000-000000000009", "admin@example.test", null, "SUPER_ADMIN"],
];

const cases = [
  {
    id: "30000000-0000-4000-8000-000000000124", personId: "20000000-0000-4000-8000-000000000124", publicId: "GEO-00124", state: "PUBLISHED",
    nameKa: "ნინო კალანდაძე", nameEn: "Nino Kalandadze", age: 24, locationKa: "იმერეთი, ქუთაისი", locationEn: "Imereti, Kutaisi", broadKa: "იმერეთი", broadEn: "Imereti",
    missingKa: "12 აგვისტო, 2026", missingEn: "12 August 2026", verifiedKa: "23 აგვისტო, 2026", verifiedEn: "23 August 2026",
    storyKa: "ნინო ბოლოს ქუთაისში ნახეს. ნებისმიერი შესაძლო ინფორმაცია მხოლოდ პლატფორმის დაცული არხით უნდა გაიგზავნოს.", storyEn: "Nino was last seen in Kutaisi. Any possible information should be shared only through the platform’s protected channel.",
    image: "/assets/portraits/nino-kalandadze.png", publishedAt: "2026-08-14T10:35:00.000Z", contactAt: "2026-08-13T08:40:00.000Z", privacy: "NOT_REQUIRED", indexing: "INDEX",
  },
  {
    id: "30000000-0000-4000-8000-000000000131", personId: "20000000-0000-4000-8000-000000000131", publicId: "GEO-00131", state: "PUBLISHED",
    nameKa: "გიორგი მენაბდე", nameEn: "Giorgi Menabde", age: 19, locationKa: "კახეთი, თელავი", locationEn: "Kakheti, Telavi", broadKa: "კახეთი", broadEn: "Kakheti",
    missingKa: "10 აგვისტო, 2026", missingEn: "10 August 2026", verifiedKa: "21 აგვისტო, 2026", verifiedEn: "21 August 2026",
    storyKa: "გიორგი ბოლოს თელავის მუნიციპალიტეტში ნახეს. გვერდზე ნაჩვენებია მხოლოდ Find Georgia-ს მიერ გამოსაქვეყნებლად განხილული ინფორმაცია.", storyEn: "Giorgi was last seen in Telavi municipality. Only information reviewed for publication by Find Georgia appears on this page.",
    image: "/assets/portraits/giorgi-menabde.png", publishedAt: "2026-08-12T11:00:00.000Z", contactAt: "2026-08-11T09:00:00.000Z", privacy: "NOT_REQUIRED", indexing: "INDEX",
  },
  {
    id: "30000000-0000-4000-8000-000000000136", personId: "20000000-0000-4000-8000-000000000136", publicId: "GEO-00136", state: "DISPUTED",
    nameKa: "მარიამ ხუციშვილი", nameEn: "Mariam Khutsishvili", age: 32, locationKa: "სამეგრელო, ზუგდიდი", locationEn: "Samegrelo, Zugdidi", broadKa: "სამეგრელო", broadEn: "Samegrelo",
    missingKa: "8 აგვისტო, 2026", missingEn: "8 August 2026", verifiedKa: "20 აგვისტო, 2026", verifiedEn: "20 August 2026",
    storyKa: "საქმე დროებით შეზღუდულია, სანამ უფლებამოსილი გუნდი მიღებულ საჩივარს განიხილავს.", storyEn: "This case is temporarily limited while an authorized team reviews a report.",
    image: "/assets/portraits/mariam-khutsishvili.png", publishedAt: "2026-08-10T05:10:00.000Z", contactAt: "2026-08-09T10:00:00.000Z", disputedAt: "2026-08-24T05:00:00.000Z", privacy: "UNDER_REVIEW", indexing: "NOINDEX",
  },
  {
    id: "30000000-0000-4000-8000-000000000118", personId: "20000000-0000-4000-8000-000000000118", publicId: "GEO-00118", state: "FOUND",
    nameKa: "ალექსი თაბუკაშვილი", nameEn: "Aleksi Tabukashvili", age: 58, locationKa: "მცხეთა-მთიანეთი", locationEn: "Mtskheta-Mtianeti", broadKa: "მცხეთა-მთიანეთი", broadEn: "Mtskheta-Mtianeti",
    missingKa: "6 აგვისტო, 2026", missingEn: "6 August 2026", verifiedKa: "24 აგვისტო, 2026", verifiedEn: "24 August 2026",
    storyKa: "ეს ადამიანი ნაპოვნია.", storyEn: "This person has been found.", image: "/assets/portraits/alex-tabukashvili.png",
    publishedAt: "2026-08-08T08:20:00.000Z", contactAt: "2026-08-07T10:00:00.000Z", foundAt: "2026-08-24T07:30:00.000Z", privacy: "PENDING", indexing: "NOINDEX",
  },
  {
    id: "30000000-0000-4000-8000-000000000142", personId: "20000000-0000-4000-8000-000000000142", publicId: "GEO-00142", state: "NEEDS_MORE_INFORMATION",
    nameKa: "თამარ ხარებავა", nameEn: "Tamar Kharebava", age: 27, locationKa: "თბილისი", locationEn: "Tbilisi", broadKa: "თბილისი", broadEn: "Tbilisi",
    missingKa: "22 აგვისტო, 2026", missingEn: "22 August 2026", verifiedKa: "22 აგვისტო, 2026", verifiedEn: "22 August 2026",
    storyKa: "გამოქვეყნებამდე საჭიროა დამატებითი ინფორმაცია.", storyEn: "More information is needed before publication.", image: "/assets/portraits/mariam-khutsishvili.png",
    contactAt: "2026-08-22T12:00:00.000Z", privacy: "NOT_REQUIRED", indexing: "NOINDEX",
  },
  {
    id: "30000000-0000-4000-8000-000000000150", personId: "20000000-0000-4000-8000-000000000150", publicId: "GEO-00150", state: "SUSPENDED",
    nameKa: "ეკა ბერიძე", nameEn: "Eka Beridze", age: 41, locationKa: "აჭარა", locationEn: "Adjara", broadKa: "აჭარა", broadEn: "Adjara",
    missingKa: "2 აგვისტო, 2026", missingEn: "2 August 2026", verifiedKa: "18 აგვისტო, 2026", verifiedEn: "18 August 2026",
    storyKa: "საქმე შეჩერებულია ადამიანური უსაფრთხოების მიმოხილვისთვის.", storyEn: "This case is suspended for a human safety review.", image: "/assets/portraits/mariam-khutsishvili.png",
    publishedAt: "2026-08-04T08:00:00.000Z", contactAt: "2026-08-03T09:00:00.000Z", suspendedAt: "2026-08-20T09:00:00.000Z", privacy: "UNDER_REVIEW", indexing: "NOINDEX",
  },
];

export async function seedDatabase(db, config, { force = false } = {}) {
  const now = isoNow();
  for (const role of ROLES) await db.prepare("INSERT INTO roles(id, name) VALUES (?, ?) ON CONFLICT DO NOTHING").run(role, role);
  for (const permission of PERMISSIONS) await db.prepare("INSERT INTO permissions(id, name) VALUES (?, ?) ON CONFLICT DO NOTHING").run(permission, permission);
  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permission of permissions) await db.prepare("INSERT INTO role_permissions(role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(role, permission);
  }
  if (!force && Number((await db.prepare("SELECT COUNT(*) count FROM users").get()).count)) return;

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const [id, email, phone, role] of users) {
    await db.prepare(`INSERT INTO users(id, email, phone, password_hash, email_verified_at, phone_verified_at, mfa_enabled, mfa_secret_encrypted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
      .run(id, email, phone, passwordHash, now, phone ? now : null, 1, encryptSensitive(DEMO_MFA_SECRET, config.dataEncryptionKey), now, now);
    await db.prepare("INSERT INTO user_roles(user_id, role_id, assigned_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(id, role, now);
  }

  const ownerId = users[0][0];
  for (const item of cases) {
    await db.prepare("INSERT INTO missing_people(id, name_ka, name_en, age, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
      .run(item.personId, item.nameKa, item.nameEn, item.age, now, now);
    await db.prepare(`INSERT INTO cases(id, public_case_id, missing_person_id, owner_user_id, state, location_ka, location_en,
      broad_location_ka, broad_location_en, missing_date_ka, missing_date_en, story_ka, story_en, public_image_url, contact_verified_at,
      last_verified_at, last_verified_ka, last_verified_en, published_at, disputed_at, suspended_at, found_at, privacy_review_status, indexing_policy, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
      .run(item.id, item.publicId, item.personId, ownerId, item.state, item.locationKa, item.locationEn, item.broadKa, item.broadEn,
        item.missingKa, item.missingEn, item.storyKa, item.storyEn, item.image, item.contactAt || null, "2026-08-24T08:00:00.000Z",
        item.verifiedKa, item.verifiedEn, item.publishedAt || null, item.disputedAt || null, item.suspendedAt || null, item.foundAt || null,
        item.privacy, item.indexing, now, now);
    const adminStatus = item.publicId === "GEO-00142" ? "DRAFT" : item.publicId === "GEO-00150" ? "ARCHIVED" : item.state === "FOUND" ? "FOUND" : item.state === "PUBLISHED" ? "PUBLISHED" : "UNPUBLISHED";
    await db.prepare(`UPDATE cases SET admin_status = ?, sex = ?, region_ka = ?, region_en = ?, municipality_ka = ?, municipality_en = ?,
      source_type = ?, source_url = ?, source_note = ?, verified_by = ?, verified_at = ?, admin_notes = ?, archived_at = ? WHERE id = ?`)
      .run(adminStatus, item.publicId === "GEO-00131" ? "MALE" : "FEMALE", item.broadKa, item.broadEn, item.locationKa, item.locationEn,
        "TRUSTED_MEDIA", "https://example.test/fictional-source", "Fictional source reviewed for Alpha demonstration.", ownerId,
        item.publishedAt || now, "Internal fictional demo note. Never public.", adminStatus === "ARCHIVED" ? now : null, item.id);
  }

  await seedTips(db, config, now);
  await seedOperations(db, now);
}

async function seedTips(db, config, now) {
  const fixtures = [
    ["50000000-0000-4000-8000-000000000104", "TIP-0104", cases[0].id, "PERSONALLY_SAW", 1, "2026-08-23T18:20:00.000Z", 0, "Kutaisi central station", "Kutaisi", "RECOGNIZED", "I saw someone I recognized from the published photo near the station entrance.", "HIGH_INFORMATION_QUALITY", "IMPORTANT", "NO_FLAG"],
    ["50000000-0000-4000-8000-000000000105", "TIP-0105", cases[1].id, "SECOND_HAND", 0, null, 1, "Kakheti", null, "UNSURE", "A friend said they may have seen him somewhere in the region.", "LOW_INFORMATION", "SPAM", "NO_FLAG"],
    ["50000000-0000-4000-8000-000000000106", "TIP-0106", cases[0].id, "POSSIBLE_LOCATION", 0, "2026-08-22T00:00:00.000Z", 1, "Kutaisi", "Kutaisi", "MAYBE", "Same information as an earlier submission.", "NEEDS_FOLLOW_UP", "REVIEWED", "NO_FLAG"],
    ["50000000-0000-4000-8000-000000000107", "TIP-0107", cases[0].id, "OTHER", 0, null, 1, "", null, "UNSURE", "Pay me and I will tell you where they are. Send money now.", "NEEDS_FOLLOW_UP", "FRAUD_SUSPECTED", "FRAUD_SAFETY_REVIEW"],
    ["50000000-0000-4000-8000-000000000108", "TIP-0108", cases[1].id, "OTHER", 0, null, 1, "", null, "UNSURE", "Repeated abusive spam message.", "LOW_INFORMATION", "SPAM", "ABUSE_REVIEW"],
  ];
  for (const tip of fixtures) {
    await db.prepare(`INSERT INTO tips(id, reference_code, case_id, tip_type, first_hand, occurred_at, unknown_time, location_text, municipality,
      confidence, description, reporter_contact_encrypted, information_quality, moderation_status, fraud_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
      .run(...tip.slice(0, 11), encryptSensitive("reporter@example.test", config.dataEncryptionKey), ...tip.slice(11), now, now);
  }
  const fraudTipId = fixtures[3][0];
  for (const signal of ["PAYMENT_DEMAND", "EXTORTION_LANGUAGE"]) {
    await db.prepare("INSERT INTO risk_signals(id, resource_type, resource_id, signal_type, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
      .run(opaqueId(), "TIP", fraudTipId, signal, "RULE_ASSISTED_TRIAGE", "OPEN", now);
  }
  await db.prepare("INSERT INTO risk_signals(id, resource_type, resource_id, signal_type, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
    .run(opaqueId(), "TIP", fixtures[2][0], "DUPLICATE_TIP", "DEMO_SEED", "OPEN", now);
}

async function seedOperations(db, now) {
  await db.prepare(`INSERT INTO privacy_requests(id, public_request_id, type, object_type, object_id, description, contact_encrypted, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
    .run("70000000-0000-4000-8000-000000000301", "PRQ-0301", "CORRECTION", "CASE", cases[0].id, "Correct fictional case information.", "seed-encrypted-contact", "UNDER_REVIEW", now, now);
  const events = [
    ["CASE_CREATED", cases[4].id], ["CASE_PUBLISHED", cases[0].id], ["CASE_PUBLISHED", cases[1].id],
    ["CASE_FOUND", cases[3].id], ["CASE_ARCHIVED", cases[5].id], ["TIP_ROUTED_TO_FRAUD_REVIEW", "50000000-0000-4000-8000-000000000107"],
  ];
  for (const [action, resourceId] of events) {
    await db.prepare("INSERT INTO audit_events(id, actor_id, actor_role, action, resource_type, resource_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
      .run(opaqueId(), users[0][0], "ADMIN", action, resourceId.startsWith("5") ? "TIP" : "CASE", resourceId, now);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { loadConfig } = await import("./config.js");
  const { openConfiguredDatabase } = await import("./db.js");
  const config = loadConfig();
  const db = await openConfiguredDatabase(config);
  await seedDatabase(db, config);
  await db.close();
  console.log("Seed complete");
}
