import { useCallback, useEffect, useMemo, useState } from "react";
import { LockKey, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { Modal } from "./components";
import { api, friendlyError, normalizeAudit, normalizeCase, normalizeTip, privacyTypeCode, statusCode } from "./api";
import { ModeratorCenter } from "./Moderator";
import { CasePage, PosterModal, PrivacyRequestForm, PublicHeader, PublicHome, StructuredTipForm, publicCopy } from "./PublicViews";

function readRoute() {
  const hash = window.location.hash || "#top";
  if (hash.startsWith("#/case/")) return { name: "case", id: decodeURIComponent(hash.slice(7)) };
  if (hash.startsWith("#/admin") || hash.startsWith("#/moderator")) return { name: "admin" };
  return { name: "home" };
}

function mergeCases(current, incoming) {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const raw of incoming.map(normalizeCase)) map.set(raw.id, { ...map.get(raw.id), ...raw });
  return [...map.values()];
}

export function App() {
  const [language, setLanguage] = useState("ka");
  const [route, setRoute] = useState(readRoute);
  const [modal, setModal] = useState(null);
  const [session, setSession] = useState(undefined);
  const [cases, setCases] = useState([]);
  const [tips, setTips] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [shareEvents, setShareEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appError, setAppError] = useState("");

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const refreshPublic = useCallback(async () => {
    const payload = await api.publicCases({ status: "all", limit: 50 });
    setCases((items) => mergeCases(items, payload.cases));
  }, []);

  const refreshAdmin = useCallback(async (user) => {
    const [casePayload, bootstrap] = await Promise.all([
      user?.permissions?.includes("CASE_READ_ALL") ? api.adminCases() : Promise.resolve({ cases: [] }),
      api.moderationBootstrap(),
    ]);
    setCases((items) => mergeCases(items, casePayload.cases || []));
    setTips((bootstrap.tips || []).map(normalizeTip));
    setAuditEvents((bootstrap.auditEvents || []).map(normalizeAudit));
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await api.csrf();
        const [sessionPayload] = await Promise.all([api.session(), refreshPublic()]);
        if (active) setSession(sessionPayload.user);
      } catch (error) {
        if (active) setAppError(friendlyError(error, language));
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [language, refreshPublic]);

  useEffect(() => {
    if (route.name !== "admin" || !session) return;
    refreshAdmin(session).catch((error) => setAppError(friendlyError(error, language)));
  }, [language, refreshAdmin, route.name, session]);

  useEffect(() => {
    if (route.name !== "case" || cases.some((item) => item.id === route.id)) return;
    api.publicCase(route.id).then(({ case: item }) => setCases((items) => mergeCases(items, [item]))).catch((error) => setAppError(friendlyError(error, language)));
  }, [cases, language, route]);

  const navigate = useCallback((name, value) => {
    setModal(null);
    setAppError("");
    if (name === "case") window.location.hash = `#/case/${encodeURIComponent(value)}`;
    else if (["admin", "moderator"].includes(name)) window.location.hash = "#/admin";
    else {
      window.location.hash = "#top";
      if (value) window.setTimeout(() => document.getElementById(value)?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  }, []);

  const login = useCallback(async (email, password, mfaCode) => {
    const payload = await api.login(email, password, mfaCode);
    setSession(payload.user);
    await refreshAdmin(payload.user);
    return payload.user;
  }, [refreshAdmin]);

  const logout = useCallback(async () => {
    await api.logout();
    setSession(null);
    setTips([]);
    setAuditEvents([]);
    await refreshPublic();
  }, [refreshPublic]);

  const openModal = useCallback((type, person = null) => setModal({ type, person }), []);
  const closeModal = useCallback(() => setModal(null), []);

  const submitTip = useCallback(async (draft) => {
    const occurredAt = draft.occurredDate ? `${draft.occurredDate}T${draft.unknownTime || !draft.occurredTime ? "00:00" : draft.occurredTime}:00.000Z` : undefined;
    const payload = await api.submitTip({
      caseId: draft.caseId, tipType: draft.tipType, firstHand: draft.firstHand, occurredAt, unknownTime: draft.unknownTime,
      location: draft.location, municipality: draft.municipality || undefined, confidence: draft.confidence, description: draft.description,
      reporterContact: typeof draft.reporterContact === "string" ? draft.reporterContact : undefined,
    }, draft.attachmentFile, draft.botToken);
    return { id: payload.tip.id };
  }, []);

  const submitPrivacy = useCallback(async (draft) => {
    const accountRequest = draft.objectId === "ACCOUNT";
    const payload = await api.submitPrivacy({ type: privacyTypeCode(draft.type), objectType: accountRequest ? "ACCOUNT" : "CASE", objectId: accountRequest ? undefined : draft.objectId, description: draft.description, contact: draft.contact }, draft.botToken);
    return { id: payload.privacyRequest.id };
  }, []);

  const createAdminCase = useCallback(async (draft, file) => {
    let payload = await api.adminCreateCase(draft);
    if (file) {
      await api.adminPublicImage(payload.case.internalId, file);
      payload = await api.adminCase(payload.case.internalId);
    }
    setCases((items) => mergeCases(items, [payload.case]));
    await refreshAdmin(session);
    return normalizeCase(payload.case);
  }, [refreshAdmin, session]);

  const updateAdminCase = useCallback(async (id, changes, file) => {
    const current = cases.find((item) => item.id === id || item.internalId === id);
    const internalId = current?.internalId || id;
    let payload = await api.adminUpdateCase(internalId, { ...changes, expectedVersion: current?.version });
    if (file) {
      await api.adminPublicImage(internalId, file);
      payload = await api.adminCase(internalId);
    }
    setCases((items) => mergeCases(items, [payload.case]));
    await refreshAdmin(session);
    return normalizeCase(payload.case);
  }, [cases, refreshAdmin, session]);

  const previewAdminCase = useCallback(async (id) => {
    const internalId = cases.find((item) => item.id === id || item.internalId === id)?.internalId || id;
    const payload = await api.adminPreview(internalId);
    return normalizeCase(payload.case);
  }, [cases]);

  const adminCaseAction = useCallback(async (id, action, reason) => {
    const internalId = cases.find((item) => item.id === id || item.internalId === id)?.internalId || id;
    const payload = await api.adminAction(internalId, action.toLowerCase(), reason);
    setCases((items) => mergeCases(items, [payload.case]));
    await Promise.all([refreshAdmin(session), refreshPublic()]);
    return normalizeCase(payload.case);
  }, [cases, refreshAdmin, refreshPublic, session]);

  const moderateTip = useCallback(async (id, status, reason) => {
    const item = tips.find((tip) => tip.id === id || tip.internalId === id);
    await api.moderateTip(item?.internalId || id, statusCode(status), reason);
    await refreshAdmin(session);
  }, [refreshAdmin, session, tips]);

  const trackShare = useCallback((caseId, channel) => setShareEvents((items) => [...items, { caseId, channel, timestamp: new Date().toISOString() }]), []);
  const selectedCase = useMemo(() => route.name === "case" ? cases.find((item) => item.id === route.id) : null, [cases, route]);
  const publicEligible = selectedCase && ["Published", "Found", "Closed"].includes(selectedCase.verificationStatus);
  const t = publicCopy[language];

  useEffect(() => {
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content = route.name === "home" || (route.name === "case" && selectedCase?.indexing === "INDEX") ? "index,follow" : "noindex,nofollow";
  }, [route.name, selectedCase?.indexing]);

  const overlays = <>
    {modal?.type === "tip" && <Modal label={t.tip} onClose={closeModal}><StructuredTipForm person={modal.person || cases.find((item) => item.status === "Missing")} language={language} onClose={closeModal} onSubmit={submitTip} /></Modal>}
    {modal?.type === "privacy" && <Modal label={t.privacy} onClose={closeModal}><PrivacyRequestForm person={modal.person} language={language} onClose={closeModal} onSubmit={submitPrivacy} /></Modal>}
    {modal?.type === "poster" && <Modal label="Poster and QR code" onClose={closeModal} size="wide"><PosterModal person={modal.person} language={language} onClose={closeModal} onShare={trackShare} /></Modal>}
  </>;

  if (loading) return <main className="app-loading"><SpinnerGap size={42} className="spin" /><h1>{language === "ka" ? "დაცული სერვისის ჩატვირთვა…" : "Loading the secure service…"}</h1></main>;

  if (route.name === "admin") return <ModeratorCenter cases={cases} tips={tips} auditEvents={auditEvents} language={language} navigate={navigate} session={session} onLogin={login} onLogout={logout} onCreateCase={createAdminCase} onUpdateCase={updateAdminCase} onPreviewCase={previewAdminCase} onCaseAction={adminCaseAction} onTipAction={moderateTip} shareEvents={shareEvents} />;

  return <div className="app-shell">
    <PublicHeader language={language} setLanguage={setLanguage} navigate={navigate} />
    {appError && <div className="app-error" role="alert"><WarningCircle size={20} />{appError}<button onClick={() => setAppError("")}>×</button></div>}
    {route.name === "home" && <PublicHome cases={cases} language={language} navigate={navigate} />}
    {route.name === "case" && publicEligible && <CasePage person={selectedCase} language={language} navigate={navigate} openModal={openModal} onShare={trackShare} />}
    {route.name === "case" && !publicEligible && <main className="case-page minimal-case-page"><section className="restricted-public-state"><LockKey size={60} weight="fill" /><h1>{language === "ka" ? "ეს საქმე საჯაროდ ხელმისაწვდომი არ არის" : "This case is not publicly available"}</h1><p>{appError || (language === "ka" ? "საქმე შეიძლება იყოს გამოუქვეყნებელი ან არქივში გადატანილი." : "The case may be unpublished or archived.")}</p><button className="button ghost" onClick={() => navigate("home")}>{language === "ka" ? "საქმეების ნახვა" : "Browse public cases"}</button></section></main>}
    <footer id="about"><button className="brand footer-brand" onClick={() => navigate("home")}><img src="/assets/find-georgia-mark.png" alt="" /><strong>{language === "ka" ? "იპოვე საქართველო" : "Find Georgia"}</strong></button><p>{language === "ka" ? "დაკარგული ადამიანების საჯარო ინფორმაციის პლატფორმა" : "Missing persons public information platform"}</p><div><button onClick={() => openModal("privacy")}>{t.privacy}</button><button onClick={() => navigate("admin")}>{t.staff}</button></div></footer>
    {overlays}
  </div>;
}
