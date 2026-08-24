import { useEffect, useRef } from "react";
import {
  CalendarBlank,
  Clock,
  Info,
  LockKey,
  MapPin,
  ShieldCheck,
  User,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`field ${className}`.trim()}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Modal({ children, onClose, label, size = "standard" }) {
  const modalRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    const modal = modalRef.current;
    const focusable = modal?.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    focusable?.[0]?.focus();

    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      previousFocus.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={modalRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={22} /></button>
        {children}
      </section>
    </div>
  );
}

const toneMap = {
  Draft: "neutral",
  Published: "good",
  Unpublished: "warning",
  Archived: "muted",
  Found: "found",
  Closed: "muted",
  New: "neutral",
  Reviewed: "neutral",
  Important: "good",
  Forwarded: "neutral",
  Spam: "muted",
  "Fraud Suspected": "danger",
};

const kaStatus = {
  Draft: "მონახაზი", Published: "გამოქვეყნებულია", Unpublished: "გამოუქვეყნებელია", Archived: "არქივშია", Found: "ნაპოვნია", Closed: "დახურულია",
  Missing: "დაკარგულია", "Under Review": "განხილვაშია", New: "ახალი",
  Reviewed: "განხილულია", Important: "მნიშვნელოვანი", Forwarded: "გადაგზავნილია", Spam: "სპამი", "Fraud Suspected": "საეჭვო თაღლითობა",
  Pending: "მოლოდინში", Completed: "დასრულებულია", Approved: "დამტკიცებულია", Rejected: "უარყოფილია",
  "Needs Information": "საჭიროა ინფორმაცია", "Not Required": "არ არის საჭირო",
};

export function StatusBadge({ status, compact = false, language = "en" }) {
  const label = language === "ka" ? kaStatus[status] || status : status;
  return <span className={`status-badge tone-${toneMap[status] || "neutral"} ${compact ? "compact" : ""}`}>{label}</span>;
}

export function CaseFacts({ person, language, compact = false }) {
  const labels = language === "ka"
    ? { age: "წლის", missing: "დაკარგვის თარიღი", updated: "ბოლო განახლება" }
    : { age: "years old", missing: "Missing since", updated: "Last updated" };
  return (
    <div className={compact ? "case-facts compact" : "case-facts"}>
      <span><MapPin size={20} weight="duotone" />{person.broadLocation?.[language] || person.location?.[language] || "—"}</span>
      <span><User size={20} weight="duotone" />{person.age ?? "—"} {labels.age}</span>
      <span><CalendarBlank size={20} weight="duotone" />{compact ? person.missingDate?.[language] : `${labels.missing}: ${person.missingDate?.[language] || "—"}`}</span>
      {!compact && <span><Clock size={20} weight="duotone" />{labels.updated}: {person.lastVerifiedAt?.[language] || "—"}</span>}
    </div>
  );
}

export function TrustPanel({ person, language }) {
  const t = language === "ka"
    ? {
        title: "საქმის ინფორმაცია",
        reviewed: "გამოქვეყნებულია Find Georgia-ს მიერ",
        caveat: "საჯარო გვერდზე ნაჩვენებია მხოლოდ მიზნობრივად შერჩეული ინფორმაცია.",
        id: "საქმის ID",
        updated: "ბოლო განახლება",
      }
    : {
        title: "Case information",
        reviewed: "Published by Find Georgia",
        caveat: "Only deliberately selected information appears on this public page.",
        id: "Case ID",
        updated: "Last updated",
      };
  return (
    <aside className="trust-panel" aria-label={t.title}>
      <div className="trust-panel-title"><ShieldCheck size={22} weight="fill" /><strong>{t.title}</strong></div>
      <ul>
        <li><CheckLine />{t.reviewed}</li>
        <li><span>{t.id}</span><strong>{person.id}</strong></li>
        <li><span>{t.updated}</span><strong>{person.lastVerifiedAt?.[language] || "—"}</strong></li>
      </ul>
      <p><Info size={17} weight="fill" />{t.caveat}</p>
    </aside>
  );
}

function CheckLine() {
  return <span className="check-dot"><ShieldCheck size={15} weight="fill" /></span>;
}

export function PrivateNotice({ language, children }) {
  return (
    <div className="private-notice"><LockKey size={20} weight="fill" /><span>{children || (language === "ka" ? "ეს ინფორმაცია პირადია და საჯაროდ არ გამოჩნდება." : "This information is private and will not be posted publicly.")}</span></div>
  );
}

export function BackendNotice({ language }) {
  return (
    <div className="backend-notice"><WarningCircle size={20} weight="fill" /><span>{language === "ka" ? "უსაფრთხო Alpha: მხოლოდ ადმინისტრატორის მიერ მართული საქმეები, სერვერული როლები, HttpOnly სესიები, MFA, rate limits, ფაილის შემოწმება და append-only აუდიტი აქტიურია. საჯარო გაშვებამდე საჭიროა გამძლე წარმოების მონაცემთა ბაზა, ობიექტური საცავი, malware scanning და ოპერაციული მონიტორინგი." : "Secure Alpha: admin-managed cases, server-side roles, HttpOnly sessions, MFA, rate limits, file validation, and append-only audit are active. Public launch still requires a resilient production database, object storage, malware scanning, and operational monitoring."}</span></div>
  );
}

export function SubmissionProtection({ language }) {
  return <div className="protection-note"><ShieldCheck size={18} weight="fill" /><span>{language === "ka" ? "განმეორებითი გაგზავნა დამუშავებისას ითიშება. სერვერი იყენებს CSRF, rate limit-სა და bot შემოწმებას და უსაფრთხოების შიდა დეტალებს პასუხში არ აჩვენებს." : "Repeat submit is disabled while processing. The server enforces CSRF, rate limits, and bot checks without exposing internal security details."}</span></div>;
}

export function EmptyState({ title, body }) {
  return <div className="empty-state"><Info size={32} /><div><strong>{title}</strong>{body && <p>{body}</p>}</div></div>;
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose, dangerous = false, language = "en" }) {
  return (
    <Modal label={title} onClose={onClose} size="small">
      <div className="confirm-dialog">
        <WarningCircle size={44} weight="fill" />
        <h2>{title}</h2>
        <div className="confirm-body">{body}</div>
        <div className="confirm-actions">
          <button className="button ghost" onClick={onClose}>{language === "ka" ? "გაუქმება" : "Cancel"}</button>
          <button className={`button ${dangerous ? "danger" : "primary"}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}
