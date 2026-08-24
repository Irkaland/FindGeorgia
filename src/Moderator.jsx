import { useEffect, useState } from "react";
import {
  Archive, ArrowLeft, CheckCircle, ClipboardText, Eye, FilePlus, FolderOpen, Gauge, Gear, ImageSquare,
  LockKey, MagnifyingGlass, NotePencil, PaperPlaneTilt, ShieldCheck, SignOut, SpinnerGap, Users, WarningCircle,
} from "@phosphor-icons/react";
import { BackendNotice, ConfirmDialog, EmptyState, Field, Modal, StatusBadge } from "./components";
import { api, friendlyError } from "./api";
import { CasePage } from "./PublicViews";

const copy = {
  en: { title: "Find Georgia Admin", dashboard: "Dashboard", cases: "Cases", newCase: "New case", tips: "Tips", archive: "Archive", audit: "Audit", settings: "Settings", back: "Public site" },
  ka: { title: "Find Georgia ადმინისტრაცია", dashboard: "მიმოხილვა", cases: "საქმეები", newCase: "ახალი საქმე", tips: "შეტყობინებები", archive: "არქივი", audit: "აუდიტი", settings: "პარამეტრები", back: "საჯარო გვერდი" },
};

const sourceTypes = [
  "OFFICIAL_PUBLICATION", "POLICE_AGENCY", "TRUSTED_MEDIA", "VERIFIED_ORGANIZATION", "DIRECT_VERIFIED_CONTACT", "OTHER_REVIEWED_SOURCE",
];

const transitions = {
  DRAFT: ["PUBLISH", "ARCHIVE"],
  PUBLISHED: ["UNPUBLISH", "FOUND"],
  UNPUBLISHED: ["PUBLISH", "ARCHIVE"],
  FOUND: ["CLOSE"],
  CLOSED: ["ARCHIVE"],
  ARCHIVED: [],
};

const actionLabels = {
  PUBLISH: "Publish", UNPUBLISH: "Unpublish", FOUND: "Mark found", CLOSE: "Close", ARCHIVE: "Archive",
};

function viewsFor(permissions = []) {
  const views = [{ id: "dashboard", icon: Gauge }];
  if (permissions.includes("CASE_READ_ALL")) views.push({ id: "cases", icon: FolderOpen }, { id: "newCase", icon: FilePlus });
  if (permissions.includes("TIP_READ")) views.push({ id: "tips", icon: PaperPlaneTilt });
  if (permissions.includes("CASE_READ_ALL")) views.push({ id: "archive", icon: Archive });
  if (permissions.includes("AUDIT_READ")) views.push({ id: "audit", icon: ClipboardText });
  views.push({ id: "settings", icon: Gear });
  return views;
}

export function ModeratorCenter({ cases, tips, auditEvents, language, navigate, session, onLogin, onLogout, onCreateCase, onUpdateCase, onPreviewCase, onCaseAction, onTipAction }) {
  const t = copy[language];
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState("");
  const permissions = session?.permissions || [];
  const visibleCases = cases.filter((item) => item.internalId);
  const selected = visibleCases.find((item) => item.id === selectedId || item.internalId === selectedId);

  useEffect(() => {
    if (view === "newCase") setSelectedId(null);
  }, [view]);

  if (!session) return <AdminLogin language={language} navigate={navigate} onLogin={onLogin} />;

  const openCase = (item) => { setSelectedId(item.internalId || item.id); setView("editor"); setNotice(""); };
  const action = async (reason) => {
    try {
      const updated = await onCaseAction(pending.item.internalId || pending.item.id, pending.action, reason);
      setSelectedId(updated.internalId || updated.id);
      setPending(null);
      setNotice(language === "ka" ? "სტატუსი განახლდა." : "Case status updated.");
    } catch (error) { setNotice(friendlyError(error, language)); setPending(null); }
  };

  return <main className="moderator-page">
    <header className="moderator-topbar">
      <button className="brand brand-button" onClick={() => navigate("home")}><img src="/assets/find-georgia-mark.png" alt="" /><strong>{t.title}</strong></button>
      <div className="admin-identity"><span><strong>{session.email}</strong><small>{session.role.replaceAll("_", " ")}</small></span><button className="button ghost compact-button" onClick={onLogout}><SignOut />{language === "ka" ? "გასვლა" : "Sign out"}</button></div>
    </header>
    <div className="moderator-shell">
      <aside className="moderator-nav" aria-label={t.title}>
        <button className="admin-public-link" onClick={() => navigate("home")}><ArrowLeft />{t.back}</button>
        {viewsFor(permissions).map(({ id, icon: Icon }) => <button key={id} className={view === id || (id === "cases" && view === "editor") ? "active" : ""} onClick={() => setView(id)}><Icon />{t[id]}{id === "tips" && tips.filter((tip) => tip.moderationStatus === "New").length > 0 && <span>{tips.filter((tip) => tip.moderationStatus === "New").length}</span>}</button>)}
      </aside>
      <section className="moderator-content">
        {notice && <div className={notice.includes("updated") || notice.includes("განახლდა") || notice.includes("saved") ? "inline-success" : "inline-error"}>{notice}</div>}
        {view === "dashboard" && <Dashboard cases={visibleCases} tips={tips} auditEvents={auditEvents} language={language} onOpenCase={openCase} canReadCases={permissions.includes("CASE_READ_ALL")} />}
        {view === "cases" && <CasesWorkspace cases={visibleCases.filter((item) => item.adminStatus !== "ARCHIVED")} language={language} onOpen={openCase} onNew={() => setView("newCase")} />}
        {view === "newCase" && <CaseEditor language={language} onSave={onCreateCase} onSaved={openCase} setNotice={setNotice} />}
        {view === "editor" && selected && <CaseEditor key={`${selected.internalId}-${selected.lastUpdatedAt}`} item={selected} language={language} onSave={onUpdateCase} onSaved={openCase} onPreview={async () => setPreview(await onPreviewCase(selected.internalId))} onAction={(nextAction) => setPending({ item: selected, action: nextAction })} setNotice={setNotice} />}
        {view === "archive" && <CasesWorkspace cases={visibleCases.filter((item) => item.adminStatus === "ARCHIVED")} language={language} onOpen={openCase} archived />}
        {view === "tips" && <TipsWorkspace tips={tips} cases={visibleCases} language={language} onAction={onTipAction} setNotice={setNotice} />}
        {view === "audit" && <AuditWorkspace events={auditEvents} language={language} />}
        {view === "settings" && <SettingsWorkspace session={session} language={language} />}
      </section>
    </div>
    {preview && <Modal label={language === "ka" ? "საჯარო წინასწარი ნახვა" : "Public preview"} onClose={() => setPreview(null)} size="wide"><div className="preview-banner"><Eye size={20} /><strong>{language === "ka" ? "წინასწარი ნახვა — ეს ვერსია საჯარო არ არის" : "Preview — this version is not public"}</strong></div><CasePage person={preview} language={language} navigate={() => setPreview(null)} openModal={null} onShare={() => {}} /></Modal>}
    {pending && <ConfirmDialog title={actionLabels[pending.action]} confirmLabel={actionLabels[pending.action]} dangerous={["UNPUBLISH", "FOUND", "ARCHIVE"].includes(pending.action)} language={language} onClose={() => setPending(null)} onConfirm={() => action(document.getElementById("admin-action-reason")?.value || "")} body={<Field label={language === "ka" ? "მიზეზი (შიდა აუდიტისთვის)" : "Reason (for the internal audit log)"}><textarea id="admin-action-reason" rows="4" autoFocus /></Field>} />}
  </main>;
}

function AdminLogin({ language, navigate, onLogin }) {
  const initialResetToken = new URLSearchParams((window.location.hash.split("?")[1] || "")).get("reset") || "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [mode, setMode] = useState(initialResetToken ? "confirm" : "login");
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try { await onLogin(data.get("email"), data.get("password"), data.get("mfaCode")); }
    catch (caught) {
      if (caught.code === "MFA_REQUIRED") { setMfaRequired(true); setDevCode(caught.details?.developmentCode || ""); }
      setError(friendlyError(caught, language));
    } finally { setBusy(false); }
  };
  const reset = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      if (mode === "request") {
        await api.passwordResetRequest(data.get("email"));
        setMode("sent");
      } else {
        if (data.get("password") !== data.get("passwordConfirm")) throw new Error(language === "ka" ? "პაროლები არ ემთხვევა." : "Passwords do not match.");
        await api.passwordResetConfirm(initialResetToken, data.get("password"));
        window.location.hash = "#/moderator";
        setMode("done");
      }
    } catch (caught) { setError(friendlyError(caught, language)); }
    finally { setBusy(false); }
  };
  const backToLogin = () => { window.location.hash = "#/moderator"; setMode("login"); setError(""); };
  return <main className="auth-demo-page admin-auth-page"><section className="auth-card">
    <button className="back-link" onClick={() => navigate("home")}><ArrowLeft />{language === "ka" ? "საჯარო გვერდი" : "Public site"}</button>
    <span className="eyebrow"><ShieldCheck weight="fill" />{language === "ka" ? "მხოლოდ უფლებამოსილი პერსონალი" : "Authorized staff only"}</span>
    <h1>{mode === "login" ? (language === "ka" ? "ადმინისტრაციის შესვლა" : "Admin sign in") : (language === "ka" ? "პაროლის აღდგენა" : "Reset staff password")}</h1>
    <p>{mode === "login" ? (language === "ka" ? "საქმეების მართვა დაცულია სერვერული სესიით, როლებითა და MFA-ით." : "Case management is protected by server-side sessions, roles, and MFA.") : (language === "ka" ? "აღდგენის ბმული ერთჯერადია და 30 წუთში იწურება." : "Reset links are single-use and expire after 30 minutes.")}</p>
    {mode === "sent" || mode === "done" ? <div className="auth-form">
      <div className="inline-success">{mode === "sent" ? (language === "ka" ? "თუ ანგარიში არსებობს, აღდგენის ბმული ელფოსტით გაიგზავნა." : "If the account exists, a reset link has been sent by email.") : (language === "ka" ? "პაროლი განახლდა. ახლა შეგიძლიათ შეხვიდეთ." : "Your password was updated. You can now sign in.")}</div>
      <button className="button primary" type="button" onClick={backToLogin}>{language === "ka" ? "შესვლაზე დაბრუნება" : "Return to sign in"}</button>
    </div> : <form className="auth-form" onSubmit={mode === "login" ? submit : reset}>
      {mode !== "confirm" && <Field label={language === "ka" ? "ელფოსტა" : "Email"}><input name="email" type="email" autoComplete="username" defaultValue={import.meta.env.DEV ? "moderator@example.test" : undefined} required /></Field>}
      {mode === "login" && <Field label={language === "ka" ? "პაროლი" : "Password"}><input name="password" type="password" autoComplete="current-password" defaultValue={import.meta.env.DEV ? "FindGeorgia!2026" : undefined} required /></Field>}
      {mode === "confirm" && <><Field label={language === "ka" ? "ახალი პაროლი" : "New password"}><input name="password" type="password" autoComplete="new-password" minLength="12" required /></Field><Field label={language === "ka" ? "გაიმეორეთ პაროლი" : "Confirm password"}><input name="passwordConfirm" type="password" autoComplete="new-password" minLength="12" required /></Field></>}
      {mode === "login" && mfaRequired && <Field label={language === "ka" ? "MFA კოდი" : "MFA code"} hint={devCode ? `Development code: ${devCode}` : ""}><input name="mfaCode" inputMode="numeric" pattern="[0-9]{6}" required autoFocus /></Field>}
      {error && <div className="inline-error" role="alert"><WarningCircle />{error}</div>}
      <button className="button primary" disabled={busy}>{busy ? <SpinnerGap className="spin" /> : <LockKey weight="fill" />}{mode === "login" ? (language === "ka" ? "შესვლა" : "Sign in") : mode === "request" ? (language === "ka" ? "აღდგენის ბმულის გაგზავნა" : "Send reset link") : (language === "ka" ? "პაროლის განახლება" : "Update password")}</button>
      {mode === "login" ? <button className="button ghost" type="button" onClick={() => setMode("request")}>{language === "ka" ? "დაგავიწყდათ პაროლი?" : "Forgot password?"}</button> : <button className="button ghost" type="button" onClick={backToLogin}>{language === "ka" ? "შესვლაზე დაბრუნება" : "Return to sign in"}</button>}
    </form>}
    <BackendNotice language={language} />
  </section></main>;
}

function Dashboard({ cases, tips, auditEvents, language, onOpenCase, canReadCases }) {
  const counts = { published: cases.filter((item) => item.adminStatus === "PUBLISHED").length, drafts: cases.filter((item) => item.adminStatus === "DRAFT").length, found: cases.filter((item) => ["FOUND", "CLOSED"].includes(item.adminStatus)).length, tips: tips.filter((tip) => tip.moderationStatus === "New").length };
  return <div className="admin-workspace"><WorkspaceHeading eyebrow={language === "ka" ? "ოპერაციების მიმოხილვა" : "Operations overview"} title={language === "ka" ? "ადმინისტრაციის პანელი" : "Admin dashboard"} body={language === "ka" ? "გამოქვეყნება და საქმის ყველა სტატუსი კონტროლდება უფლებამოსილი ადმინისტრატორის მიერ." : "Publication and every case-state change are controlled by an authorized administrator."} />
    <div className="admin-metrics"><Metric label={language === "ka" ? "აქტიური" : "Active public"} value={counts.published} /><Metric label={language === "ka" ? "დრაფტები" : "Drafts"} value={counts.drafts} /><Metric label={language === "ka" ? "ნაპოვნი" : "Found / closed"} value={counts.found} /><Metric label={language === "ka" ? "ახალი შეტყობინებები" : "New tips"} value={counts.tips} /></div>
    <div className="admin-dashboard-grid">
      {canReadCases && <section className="admin-panel"><h2>{language === "ka" ? "ბოლო განახლებული საქმეები" : "Recently updated cases"}</h2>{cases.slice().sort((a, b) => (b.lastUpdatedAt || "").localeCompare(a.lastUpdatedAt || "")).slice(0, 5).map((item) => <button className="admin-list-row" key={item.id} onClick={() => onOpenCase(item)}><span><strong>{item.name?.[language]}</strong><small>{item.id}</small></span><StatusBadge status={item.verificationStatus} language={language} compact /></button>)}</section>}
      <section className="admin-panel"><h2>{language === "ka" ? "ბოლო აუდიტის მოვლენები" : "Recent audit events"}</h2>{auditEvents.slice(0, 6).map((event) => <div className="admin-list-row static" key={event.id}><span><strong>{event.action}</strong><small>{event.target}</small></span><time>{formatDate(event.timestamp)}</time></div>)}</section>
    </div>
  </div>;
}

function Metric({ label, value }) { return <div className="admin-metric"><strong>{value}</strong><span>{label}</span></div>; }

function WorkspaceHeading({ eyebrow, title, body, action }) {
  return <div className="workspace-heading"><div><span className="eyebrow plain">{eyebrow}</span><h1>{title}</h1>{body && <p>{body}</p>}</div>{action}</div>;
}

function CasesWorkspace({ cases, language, onOpen, onNew, archived = false }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const results = cases.filter((item) => (status === "ALL" || item.adminStatus === status) && (!query || `${item.name?.ka} ${item.name?.en} ${item.id}`.toLowerCase().includes(query.toLowerCase())));
  return <div className="admin-workspace"><WorkspaceHeading eyebrow={archived ? "Archive" : "Case management"} title={archived ? (language === "ka" ? "არქივი" : "Archived cases") : (language === "ka" ? "საქმეები" : "Cases")} body={archived ? (language === "ka" ? "არქივირებული საქმეები საჯაროდ არ ჩანს და მხოლოდ წაკითხვისთვისაა." : "Archived cases are not public and are read-only.") : (language === "ka" ? "შექმენით, შეცვალეთ, გადაამოწმეთ და მართეთ გამოქვეყნება." : "Create, edit, review, and control publication.")} action={!archived && <button className="button primary compact-button" onClick={onNew}><FilePlus />{language === "ka" ? "ახალი საქმე" : "New case"}</button>} />
    <div className="admin-toolbar"><label><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === "ka" ? "სახელი ან საქმის ID" : "Name or case ID"} /></label>{!archived && <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option>{Object.keys(transitions).filter((value) => value !== "ARCHIVED").map((value) => <option key={value}>{value}</option>)}</select>}</div>
    {results.length ? <div className="admin-table"><div className="admin-table-head"><span>{language === "ka" ? "ადამიანი" : "Person"}</span><span>{language === "ka" ? "რეგიონი" : "Region"}</span><span>{language === "ka" ? "სტატუსი" : "Status"}</span><span>{language === "ka" ? "განახლდა" : "Updated"}</span><span /></div>{results.map((item) => <button className="admin-table-row" key={item.internalId} onClick={() => onOpen(item)}><span><strong>{item.name?.[language]}</strong><small>{item.id}</small></span><span>{item.region?.[language] || "—"}</span><span><StatusBadge status={item.verificationStatus} language={language} compact /></span><time>{formatDate(item.lastUpdatedAt)}</time><NotePencil /></button>)}</div> : <EmptyState title={language === "ka" ? "საქმეები ვერ მოიძებნა" : "No cases found"} />}
  </div>;
}

function CaseEditor({ item, language, onSave, onSaved, onPreview, onAction, setNotice }) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const editing = Boolean(item);
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setNotice("");
    const data = new FormData(event.currentTarget);
    const value = (name) => String(data.get(name) || "").trim();
    const payload = {
      name: { ka: value("nameKa"), en: value("nameEn") }, sex: value("sex") || "UNKNOWN", dateOfBirth: value("dateOfBirth") || undefined,
      age: value("age") ? Number(value("age")) : undefined, missingDate: { ka: value("missingDateKa"), en: value("missingDateEn") }, missingTime: value("missingTime") || undefined,
      region: { ka: value("regionKa"), en: value("regionEn") }, municipality: { ka: value("municipalityKa"), en: value("municipalityEn") },
      location: { ka: value("locationKa"), en: value("locationEn") }, publicDescription: { ka: value("storyKa"), en: value("storyEn") },
      sourceType: value("sourceType"), sourceUrl: value("sourceUrl"), sourceNote: value("sourceNote"), adminNotes: value("adminNotes"),
    };
    try {
      const saved = editing ? await onSave(item.internalId, payload, file) : await onSave(payload, file);
      setNotice(language === "ka" ? "საქმე შენახულია." : "Case saved.");
      onSaved(saved);
    } catch (error) { setNotice(friendlyError(error, language)); }
    finally { setBusy(false); }
  };
  const v = (object, key) => object?.[key] || "";
  return <div className="admin-workspace"><WorkspaceHeading eyebrow={editing ? item.id : (language === "ka" ? "ახალი დრაფტი" : "New draft")} title={editing ? item.name?.[language] : (language === "ka" ? "ახალი საქმის შექმნა" : "Create a new case")} body={editing ? (language === "ka" ? "შეცვალეთ საჯარო ინფორმაცია და შიდა წყაროს ჩანაწერი ერთ ადგილას." : "Edit public information and the internal source record in one place.") : (language === "ka" ? "ყველა ახალი საქმე იწყება DRAFT სტატუსით და საჯაროდ არ ჩანს." : "Every new case starts as DRAFT and is not publicly visible.")} />
    <form className="admin-editor" onSubmit={save}>
      <section className="admin-form-section"><h2>{language === "ka" ? "საჯარო ინფორმაცია" : "Public case information"}</h2><div className="form-grid admin-form-grid">
        <Field label="Name (KA)"><input name="nameKa" defaultValue={v(item?.name, "ka")} required /></Field><Field label="Name (EN)"><input name="nameEn" defaultValue={v(item?.name, "en")} required /></Field>
        <Field label={language === "ka" ? "სქესი" : "Sex"}><select name="sex" defaultValue={item?.sex || "UNKNOWN"}><option value="UNKNOWN">Unknown</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></select></Field><Field label={language === "ka" ? "ასაკი" : "Age"}><input name="age" type="number" min="0" max="120" defaultValue={item?.age ?? ""} /></Field>
        <Field label={language === "ka" ? "დაბადების თარიღი" : "Date of birth"}><input name="dateOfBirth" type="date" defaultValue={item?.dateOfBirth || ""} /></Field><Field label={language === "ka" ? "დაკარგვის დრო" : "Missing time"}><input name="missingTime" type="time" defaultValue={item?.missingTime || ""} /></Field>
        <Field label="Missing date (KA)"><input name="missingDateKa" defaultValue={v(item?.missingDate, "ka")} required /></Field><Field label="Missing date (EN)"><input name="missingDateEn" defaultValue={v(item?.missingDate, "en")} required /></Field>
        <Field label="Region (KA)"><input name="regionKa" defaultValue={v(item?.region, "ka")} required /></Field><Field label="Region (EN)"><input name="regionEn" defaultValue={v(item?.region, "en")} required /></Field>
        <Field label="Municipality (KA)"><input name="municipalityKa" defaultValue={v(item?.municipality, "ka")} required /></Field><Field label="Municipality (EN)"><input name="municipalityEn" defaultValue={v(item?.municipality, "en")} required /></Field>
        <Field label="Broad public location (KA)"><input name="locationKa" defaultValue={v(item?.location, "ka")} required /></Field><Field label="Broad public location (EN)"><input name="locationEn" defaultValue={v(item?.location, "en")} required /></Field>
        <Field label="Public description (KA)"><textarea name="storyKa" rows="6" minLength="20" defaultValue={v(item?.story, "ka")} required /></Field><Field label="Public description (EN)"><textarea name="storyEn" rows="6" minLength="20" defaultValue={v(item?.story, "en")} required /></Field>
      </div><label className="upload-box admin-upload"><ImageSquare size={24} /><span>{file?.name || (item?.image ? (language === "ka" ? "საჯარო ფოტოს ჩანაცვლება" : "Replace public photo") : (language === "ka" ? "საჯარო ფოტო — აუცილებელია გამოქვეყნებამდე" : "Public photo — required before publication"))}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>{(item?.adminImageUrl || item?.image) && <img className="admin-image-preview" src={item.adminImageUrl || item.image} alt="" />}</section>
      <section className="admin-form-section internal-source-panel"><div className="internal-heading"><LockKey weight="fill" /><div><h2>{language === "ka" ? "შიდა წყარო და ადმინისტრატორის ჩანაწერები" : "Internal source and admin notes"}</h2><p>{language === "ka" ? "ეს ველები არასდროს შედის საჯარო DTO-ში ან წინასწარ ნახვაში." : "These fields never appear in the public DTO or preview."}</p></div></div><div className="form-grid admin-form-grid">
        <Field label={language === "ka" ? "წყაროს ტიპი" : "Source type"}><select name="sourceType" defaultValue={item?.sourceType || sourceTypes[0]}>{sourceTypes.map((type) => <option key={type}>{type}</option>)}</select></Field><Field label={language === "ka" ? "წყაროს URL (არასაჯარო)" : "Source URL (not public)"}><input name="sourceUrl" type="url" defaultValue={item?.sourceUrl || ""} /></Field>
        <Field label={language === "ka" ? "წყაროს შეფასება" : "Source review note"}><textarea name="sourceNote" rows="5" minLength="5" defaultValue={item?.sourceNote || ""} required /></Field><Field label={language === "ka" ? "ადმინისტრატორის ჩანაწერები" : "Admin notes"}><textarea name="adminNotes" rows="5" defaultValue={item?.adminNotes || ""} /></Field>
      </div></section>
      <div className="admin-editor-actions"><button className="button primary" disabled={busy}>{busy ? <SpinnerGap className="spin" /> : <CheckCircle weight="fill" />}{editing ? (language === "ka" ? "ცვლილებების შენახვა" : "Save changes") : (language === "ka" ? "დრაფტის შენახვა" : "Save draft")}</button>{editing && <button type="button" className="button ghost" onClick={onPreview}><Eye />{language === "ka" ? "საჯარო წინასწარი ნახვა" : "Public preview"}</button>}</div>
    </form>
    {editing && <section className="case-lifecycle-panel"><div><h2>{language === "ka" ? "საქმის სტატუსი" : "Case lifecycle"}</h2><StatusBadge status={item.verificationStatus} language={language} /></div><div>{(transitions[item.adminStatus] || []).map((action) => <button className={`button ${action === "PUBLISH" ? "primary" : "ghost"}`} key={action} onClick={() => onAction(action)}>{actionLabels[action]}</button>)}</div></section>}
  </div>;
}

function TipsWorkspace({ tips, cases, language, onAction, setNotice }) {
  const [filter, setFilter] = useState("ALL");
  const results = tips.filter((tip) => filter === "ALL" || tip.moderationStatus.toUpperCase().replaceAll(" ", "_") === filter);
  const act = async (tip, status) => { try { await onAction(tip.internalId, status, `Admin set tip to ${status}`); setNotice(language === "ka" ? "შეტყობინება განახლდა." : "Tip updated."); } catch (error) { setNotice(friendlyError(error, language)); } };
  return <div className="admin-workspace"><WorkspaceHeading eyebrow="Private intake" title={language === "ka" ? "შეტყობინებები" : "Private tips"} body={language === "ka" ? "შეტყობინებები არასდროს ქვეყნდება და მხოლოდ უფლებამოსილი მიმომხილველისთვისაა ხელმისაწვდომი." : "Tips are never public and are only available to authorized reviewers."} />
    <div className="admin-toolbar"><select value={filter} onChange={(event) => setFilter(event.target.value)}>{["ALL", "NEW", "REVIEWED", "IMPORTANT", "FORWARDED", "SPAM", "CLOSED", "FRAUD_SUSPECTED"].map((value) => <option key={value}>{value}</option>)}</select></div>
    <div className="tip-admin-list">{results.map((tip) => <article className="tip-admin-card" key={tip.internalId}><div className="tip-admin-heading"><div><span className="eyebrow plain">{tip.id} · {tip.caseId}</span><h2>{tip.tipType}</h2></div><StatusBadge status={tip.moderationStatus} language={language} /></div><p>{tip.description}</p><dl><div><dt>Location</dt><dd>{tip.location}</dd></div><div><dt>Confidence</dt><dd>{tip.confidence}</dd></div><div><dt>Case</dt><dd>{cases.find((item) => item.id === tip.caseId)?.name?.[language] || tip.caseId}</dd></div></dl><div className="tip-actions">{["REVIEWED", "IMPORTANT", "FORWARDED", "SPAM", "CLOSED", "FRAUD_SUSPECTED"].map((status) => <button key={status} onClick={() => act(tip, status)}>{status.replaceAll("_", " ")}</button>)}</div></article>)}</div>
    {!results.length && <EmptyState title={language === "ka" ? "შეტყობინებები არ არის" : "No tips in this queue"} />}
  </div>;
}

function AuditWorkspace({ events, language }) {
  return <div className="admin-workspace"><WorkspaceHeading eyebrow="Append-only history" title={language === "ka" ? "აუდიტის ჟურნალი" : "Audit log"} body={language === "ka" ? "ვინ, რა, როდის და რომელ რესურსზე შეცვალა." : "Who changed what, when, and on which resource."} />
    <div className="audit-admin-table"><div className="audit-row audit-head"><span>Time</span><span>Actor</span><span>Action</span><span>Target</span><span>Reason</span></div>{events.map((event) => <div className="audit-row" key={event.id}><time>{formatDate(event.timestamp)}</time><span>{event.actor}</span><strong>{event.action}</strong><span>{event.target}</span><span>{event.reason || "—"}</span></div>)}</div>
  </div>;
}

function SettingsWorkspace({ session, language }) {
  return <div className="admin-workspace"><WorkspaceHeading eyebrow="Access control" title={language === "ka" ? "პარამეტრები" : "Settings"} body={language === "ka" ? "წვდომა ეფუძნება სერვერზე შენახულ როლებსა და უფლებებს." : "Access is based on server-held roles and permissions."} /><section className="admin-panel settings-panel"><Users size={34} /><div><h2>{session.role.replaceAll("_", " ")}</h2><p>{session.email}</p><div className="permission-list">{session.permissions.map((permission) => <span key={permission}>{permission}</span>)}</div></div></section><BackendNotice language={language} /></div>;
}

function formatDate(value) { return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"; }
