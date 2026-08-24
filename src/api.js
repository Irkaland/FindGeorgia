let csrfToken;
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path) => `${API_BASE}${path}`;
let turnstileLoader;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoader) return turnstileLoader;
  turnstileLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true; script.defer = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => reject(new ApiClientError({ code: "BOT_PROVIDER_UNAVAILABLE", message: "Security verification is unavailable" }, 503));
    document.head.appendChild(script);
  });
  return turnstileLoader;
}

async function solveBotChallenge() {
  if (import.meta.env.DEV) return "dev-bot-pass";
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  if (!sitekey) throw new ApiClientError({ code: "BOT_PROVIDER_UNAVAILABLE", message: "Security verification is unavailable" }, 503);
  const turnstile = await loadTurnstile();
  return new Promise((resolve, reject) => {
    const overlay = document.createElement("div"); overlay.className = "bot-challenge-overlay";
    const panel = document.createElement("div"); panel.className = "bot-challenge-panel";
    const label = document.createElement("p"); label.textContent = "Complete the security check to continue.";
    const mount = document.createElement("div"); panel.append(label, mount); overlay.append(panel); document.body.append(overlay);
    let widgetId;
    const cleanup = () => { if (widgetId !== undefined) turnstile.remove(widgetId); overlay.remove(); };
    widgetId = turnstile.render(mount, {
      sitekey,
      action: "public-intake",
      callback: (token) => { cleanup(); resolve(token); },
      "error-callback": () => { cleanup(); reject(new ApiClientError({ code: "BOT_PROVIDER_UNAVAILABLE", message: "Security verification failed" }, 503)); },
      "expired-callback": () => {},
    });
  });
}

export class ApiClientError extends Error {
  constructor(error, status) {
    super(error?.message || "Request failed");
    this.code = error?.code || "NETWORK_ERROR";
    this.details = error?.details;
    this.status = status;
  }
}

async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const response = await fetch(apiUrl("/api/auth/csrf"), { credentials: "include" });
  if (!response.ok) throw new ApiClientError({ code: "NETWORK_ERROR", message: "Security initialization failed" }, response.status);
  csrfToken = (await response.json()).csrfToken;
  return csrfToken;
}

async function request(path, { method = "GET", body, form, bot = false, botToken } = {}) {
  const headers = { Accept: "application/json" };
  const options = { method, credentials: "include", headers };
  if (!["GET", "HEAD"].includes(method)) headers["x-csrf-token"] = await ensureCsrf();
  if (bot) headers["x-bot-token"] = botToken || await solveBotChallenge();
  if (form) options.body = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  let response;
  try { response = await fetch(apiUrl(path), options); }
  catch { throw new ApiClientError({ code: "NETWORK_ERROR", message: "The service is unavailable" }, 0); }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiClientError(payload.error, response.status);
  return payload;
}

const queryString = (values) => new URLSearchParams(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== ""))).toString();

export const api = {
  csrf: ensureCsrf,
  session: () => request("/api/auth/me"),
  login: (email, password, mfaCode) => request("/api/auth/login", { method: "POST", body: { email, password, ...(mfaCode ? { mfaCode } : {}) } }),
  passwordResetRequest: (email) => request("/api/auth/password-reset/request", { method: "POST", body: { email } }),
  passwordResetConfirm: (token, password) => request("/api/auth/password-reset/confirm", { method: "POST", body: { token, password } }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  publicCases: (filters = {}) => request(`/api/cases/public?${queryString({ status: "all", page: 1, limit: 50, ...filters })}`),
  publicCase: (id) => request(`/api/cases/public/${encodeURIComponent(id)}`),
  adminCases: (status) => request(`/api/cases/admin${status ? `?${queryString({ status })}` : ""}`),
  adminCase: (id) => request(`/api/cases/admin/${encodeURIComponent(id)}`),
  adminPreview: (id) => request(`/api/cases/admin/${encodeURIComponent(id)}/preview`),
  adminCreateCase: (body) => request("/api/cases/admin", { method: "POST", body }),
  adminUpdateCase: (id, body) => request(`/api/cases/admin/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  adminAction: (id, action, reason) => request(`/api/cases/admin/${encodeURIComponent(id)}/${action}`, { method: "POST", body: { reason } }),
  adminPublicImage: (id, file) => {
    const form = new FormData();
    form.append("file", file);
    return request(`/api/cases/admin/${encodeURIComponent(id)}/public-image`, { method: "POST", form });
  },
  moderationBootstrap: () => request("/api/moderation/bootstrap"),
  submitTip: (tip, file, botToken) => {
    if (file) {
      const form = new FormData();
      form.append("payload", JSON.stringify(tip));
      form.append("file", file);
      return request("/api/tips", { method: "POST", form, bot: true, botToken });
    }
    return request("/api/tips", { method: "POST", body: tip, bot: true, botToken });
  },
  moderateTip: (id, status, reason) => request(`/api/tips/${encodeURIComponent(id)}/moderate`, { method: "POST", body: { status, reason } }),
  submitPrivacy: (body, botToken) => request("/api/privacy-requests", { method: "POST", body, bot: true, botToken }),
};

const statusMap = {
  DRAFT: "Draft", PUBLISHED: "Published", UNPUBLISHED: "Unpublished", FOUND: "Found", CLOSED: "Closed", ARCHIVED: "Archived",
  NEW: "New", REVIEWED: "Reviewed", IMPORTANT: "Important", FORWARDED: "Forwarded", SPAM: "Spam", FRAUD_SUSPECTED: "Fraud Suspected",
};
const tipTypeMap = { PERSONALLY_SAW: "Personally saw the person", DIRECT_CONTACT: "Had direct contact", POSSIBLE_LOCATION: "Possible location", PHOTO_VIDEO: "Photo or video", MOVEMENT: "Movement information", SECOND_HAND: "Someone else told me", OTHER: "Other" };
const confidenceMap = { RECOGNIZED: "Recognized the person", STRONG_RESEMBLANCE: "Strongly resembled the person", MAYBE: "May have been the person", UNSURE: "Unsure" };
const riskMap = { PAYMENT_DEMAND: "Payment demand", EXTORTION_LANGUAGE: "Extortion language", THREAT: "Threat", SUSPICIOUS_LINK: "Suspicious link", DUPLICATE_TIP: "Possible duplicate", BOT_SIGNAL: "Bot signal" };

export function normalizeCase(item) {
  if (!item) return item;
  const image = item.image?.startsWith("/api/") ? apiUrl(item.image) : item.image;
  const publicPhoto = item.publicPhoto?.startsWith("/api/") ? apiUrl(item.publicPhoto) : item.publicPhoto;
  const adminImageUrl = item.adminImageUrl?.startsWith("/api/") ? apiUrl(item.adminImageUrl) : item.adminImageUrl;
  return { ...item, image, publicPhoto, adminImageUrl, verificationStatus: statusMap[item.adminStatus] || item.verificationStatus, adminStatus: item.adminStatus || Object.entries(statusMap).find(([, label]) => label === item.verificationStatus)?.[0] };
}

export function normalizeTip(item) {
  return {
    ...item,
    tipType: tipTypeMap[item.tipType] || item.tipType,
    confidence: confidenceMap[item.confidence] || item.confidence,
    informationQuality: statusMap[item.informationQuality] || item.informationQuality,
    moderationStatus: statusMap[item.moderationStatus] || item.moderationStatus,
    safetyFlags: (item.safetyFlags || []).map((flag) => riskMap[flag] || flag),
  };
}

const auditActionMap = {
  CASE_CREATED: "Case draft created", CASE_EDITED: "Case edited", SOURCE_METADATA_UPDATED: "Source metadata updated",
  CASE_PHOTO_CHANGED: "Public photo changed", CASE_PUBLISHED: "Case published", CASE_UNPUBLISHED: "Case unpublished",
  CASE_FOUND: "Case marked found", CASE_CLOSED: "Case closed", CASE_ARCHIVED: "Case archived",
  TIP_SUBMITTED: "Tip submitted privately", TIP_REVIEWED: "Tip reviewed", TIP_FORWARDED: "Tip forwarded", TIP_CLOSED: "Tip closed",
};
export function normalizeAudit(item) { return { ...item, action: auditActionMap[item.action] || item.action }; }

const privacyMap = {
  "Correct information": "CORRECTION", "Remove information": "REMOVAL", "I am the person shown on this page": "REMOVAL",
  "Unauthorized publication": "UNAUTHORIZED_PUBLICATION", "Restrict processing": "RESTRICTION", "Other privacy concern": "OTHER",
  "ინფორმაციის შესწორება": "CORRECTION", "ინფორმაციის წაშლა": "REMOVAL", "მე ვარ გვერდზე ნაჩვენები ადამიანი": "REMOVAL",
  "უნებართვო გამოქვეყნება": "UNAUTHORIZED_PUBLICATION", "დამუშავების შეზღუდვა": "RESTRICTION", "სხვა კონფიდენციალურობის საკითხი": "OTHER",
};
export const privacyTypeCode = (value) => privacyMap[value] || value;
export const statusCode = (value) => Object.entries(statusMap).find(([, label]) => label === value)?.[0] || value;

const messages = {
  AUTHENTICATION_REQUIRED: { en: "Please sign in to continue.", ka: "გასაგრძელებლად შედით ანგარიშში." },
  FORBIDDEN: { en: "You do not have access to this action.", ka: "ამ მოქმედებაზე წვდომა არ გაქვთ." },
  INVALID_STATE_TRANSITION: { en: "This action is not allowed in the case’s current state.", ka: "საქმის მიმდინარე სტატუსში ეს მოქმედება დაუშვებელია." },
  PUBLICATION_REQUIREMENTS_MISSING: { en: "Add a public photo, bilingual description, and reviewed source information before publishing.", ka: "გამოქვეყნებამდე დაამატეთ საჯარო ფოტო, ორენოვანი აღწერა და განხილული წყაროს ინფორმაცია." },
  RATE_LIMITED: { en: "Too many attempts. Please wait and try again.", ka: "ძალიან ბევრი მცდელობაა. მოიცადეთ და ხელახლა სცადეთ." },
  FILE_REJECTED: { en: "The file was rejected. Check its type and size.", ka: "ფაილი უარყოფილია. შეამოწმეთ ტიპი და ზომა." },
  NETWORK_ERROR: { en: "The secure service is unavailable. Please try again.", ka: "დაცული სერვისი მიუწვდომელია. სცადეთ ხელახლა." },
};
export function friendlyError(error, language = "en") { return messages[error?.code]?.[language] || error?.message || messages.NETWORK_ERROR[language]; }
