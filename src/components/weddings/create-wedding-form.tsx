"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { WeddingIcon } from "./wedding-icon";
import {
  budgetToMinor,
  createWeddingSchema,
  currencies,
} from "@/modules/weddings/schema";

export type EditableWedding = {
  id: string;
  version: number;
  title: string;
  couple: { brideName: string; groomName: string };
  timezone: string;
  currency: string;
  weddingDate?: string;
  budgetMinor?: string;
  currencyLocked: boolean;
};

export function CreateWeddingForm({
  timezones,
  wedding,
}: {
  timezones: string[];
  wedding?: EditableWedding;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const focusFirstError = () =>
    requestAnimationFrame(() =>
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus(),
    );
  const [uncertain, setUncertain] = useState(false);
  const [bride, setBride] = useState(wedding?.couple.brideName ?? "");
  const [groom, setGroom] = useState(wedding?.couple.groomName ?? "");
  const [title, setTitle] = useState(wedding?.title ?? "");
  const [titleEdited, setTitleEdited] = useState(!!wedding);
  const [undecided, setUndecided] = useState(!wedding?.weddingDate);
  const [currency, setCurrency] = useState(wedding?.currency ?? "INR");
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const locked = useRef(false);
  const submission = useRef<{ key: string; input: unknown } | null>(null);
  useEffect(() => {
    if (!wedding || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [wedding, dirty]);
  function discard() {
    return (
      !dirty ||
      window.confirm("Discard your changes? Your unsaved changes will be lost.")
    );
  }
  const suggested =
    bride.trim() && groom.trim()
      ? `${bride.trim()} & ${groom.trim()}’s Wedding`
      : "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || conflict) return;
    const form = new FormData(event.currentTarget);
    setError("");
    setFields({});
    if (!submission.current) {
      const dateInput = event.currentTarget.elements.namedItem("date");
      if (
        !undecided &&
        dateInput instanceof HTMLInputElement &&
        dateInput.validity.badInput
      ) {
        setFields({
          weddingDate: "Please enter a complete, valid wedding date.",
        });
        setError("Please check the highlighted fields.");
        focusFirstError();
        return;
      }
      let budgetMinor;
      try {
        budgetMinor = budgetToMinor(String(form.get("budget") ?? ""));
      } catch (e) {
        setFields({ budgetMinor: (e as Error).message });
        setError("Please check the highlighted fields.");
        focusFirstError();
        return;
      }
      const result = createWeddingSchema.safeParse({
        couple: { brideName: bride, groomName: groom },
        title: titleEdited ? title : suggested,
        timezone: form.get("timezone"),
        currency,
        ...(!undecided && form.get("date")
          ? { weddingDate: form.get("date") }
          : {}),
        ...(budgetMinor !== undefined ? { budgetMinor } : {}),
      });
      if (!result.success) {
        setFields(
          Object.fromEntries(
            result.error.issues.map((issue) => [
              issue.path.join("."),
              issue.message,
            ]),
          ),
        );
        setError("Please check the highlighted fields.");
        focusFirstError();
        return;
      }
      if (!submission.current)
        submission.current = {
          key: crypto.randomUUID(),
          input: wedding
            ? {
                ...result.data,
                weddingDate: result.data.weddingDate ?? null,
                budgetMinor: result.data.budgetMinor ?? null,
                expectedVersion: wedding.version,
              }
            : result.data,
        };
    }
    locked.current = true;
    setPending(true);
    try {
      const response = await fetch(
        wedding ? `/api/v1/weddings/${wedding.id}` : "/api/v1/weddings",
        {
          method: wedding ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "X-MMM-CSRF": "1",
            "Idempotency-Key": submission.current.key,
          },
          body: JSON.stringify(submission.current.input),
          signal: AbortSignal.timeout(20000),
        },
      );
      const data = await response.json();
      if (response.ok) {
        setDirty(false);
        router.replace(wedding ? "/wedding?updated=1" : "/wedding");
        router.refresh();
        return;
      }
      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }
      if (wedding && response.status === 404) {
        router.replace("/account");
        router.refresh();
        return;
      }
      if (
        ["VERSION_CONFLICT", "WEDDING_ARCHIVED", "CURRENCY_LOCKED"].includes(
          data.error?.code,
        )
      )
        setConflict(true);
      if (
        [
          "ACCESS_REMOVED",
          "WEDDING_ALREADY_EXISTS",
          "EMAIL_NOT_VERIFIED",
        ].includes(data.error?.code)
      ) {
        router.replace("/account");
        router.refresh();
        return;
      }
      if (response.status < 500) {
        submission.current = null;
        setUncertain(false);
      } else setUncertain(true);
      setFields(
        Object.fromEntries(
          (data.error?.fields ?? []).map(
            (field: { path: string; message: string }) => [
              field.path,
              field.message,
            ],
          ),
        ),
      );
      setError(
        data.error?.message ?? "Could not save your wedding. Please retry.",
      );
    } catch {
      setUncertain(true);
      setError(
        "We could not confirm the save. Your details are preserved. Retry the same submission or return to your account to check.",
      );
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  const invalid = (path: string) => ({
    "aria-invalid": !!fields[path],
    "aria-describedby": fields[path] ? `${path}-error` : undefined,
  });
  const message = (path: string) =>
    fields[path] && (
      <span id={`${path}-error`} className="wedding-field-error">
        <WeddingIcon name="alert" />
        {fields[path]}
      </span>
    );
  const frozen = pending || uncertain || conflict;
  return (
    <form
      className="wedding-card wedding-form"
      ref={formRef}
      onSubmit={submit}
      noValidate
      aria-busy={pending}
      onChange={() => setDirty(true)}
    >
      <fieldset disabled={frozen} className="wedding-fields">
        <legend className="sr-only">Wedding details</legend>
        <div className="wedding-grid">
          <h2 className="wedding-form-section">
            <WeddingIcon name="person" />
            Couple Information
          </h2>
          <label>
            Bride’s name <span>*</span>
            <input
              name="bride"
              autoComplete="off"
              value={bride}
              onChange={(e) => setBride(e.target.value)}
              maxLength={200}
              required
              {...invalid("couple.brideName")}
            />
            {message("couple.brideName")}
            <small>
              {wedding
                ? "Changing a name does not invite someone to your wedding."
                : "The name you want to use in your wedding workspace."}
            </small>
          </label>
          <label>
            Groom’s name <span>*</span>
            <input
              name="groom"
              autoComplete="off"
              value={groom}
              onChange={(e) => setGroom(e.target.value)}
              maxLength={200}
              required
              {...invalid("couple.groomName")}
            />
            {message("couple.groomName")}
            <small>The name you want to use in your wedding workspace.</small>
          </label>
          <label className="wedding-wide">
            <span className="wedding-label-line">
              <span>
                Wedding workspace name <span>*</span>
              </span>
              {!titleEdited && (
                <span className="wedding-suggested">
                  <WeddingIcon name="spark" /> Suggested
                </span>
              )}
            </span>
            <span className="wedding-input-decoration">
              <input
                name="title"
                value={titleEdited ? title : suggested}
                onChange={(e) => {
                  setTitleEdited(true);
                  setTitle(e.target.value);
                }}
                maxLength={200}
                required
                {...invalid("title")}
              />
              <WeddingIcon name="edit" />
            </span>
            {message("title")}
            <small>
              {wedding
                ? "Changing your names will not replace this saved workspace name."
                : "Suggested from your names. You can edit it."}
            </small>
          </label>
          <h2 className="wedding-form-section">
            <WeddingIcon name="globe" />
            Regional &amp; Financial Settings
          </h2>
          <label>
            Time zone <span>*</span>
            <span className="wedding-input-decoration">
              <input
                name="timezone"
                list="wedding-timezones"
                defaultValue={wedding?.timezone ?? "Asia/Kolkata"}
                required
                autoComplete="off"
                {...invalid("timezone")}
              />
              <WeddingIcon name="clock" />
            </span>
            <datalist id="wedding-timezones">
              {timezones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            {message("timezone")}
            <small>
              {wedding
                ? "Type to search. Changing the time zone does not change existing event times."
                : "Type to search time zones."}
            </small>
          </label>
          <label>
            Currency <span>*</span>
            <select
              name="currency"
              value={currency}
              disabled={wedding?.currencyLocked}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code} —{" "}
                  {new Intl.DisplayNames(["en"], { type: "currency" }).of(code)}
                </option>
              ))}
            </select>
            {message("currency")}
            <small>
              {wedding?.currencyLocked
                ? "Currency is locked because an expense has been recorded."
                : "Currency cannot be changed after an expense is recorded."}
            </small>
          </label>
          <h2 className="wedding-form-section">
            <WeddingIcon name="calendar" />
            Timeline &amp; Estimated Target
          </h2>
          <div>
            <label>
              Wedding date <small>(Optional)</small>
              <input
                name="date"
                type="date"
                defaultValue={wedding?.weddingDate ?? ""}
                disabled={undecided || frozen}
                {...invalid("weddingDate")}
              />
              {message("weddingDate")}
            </label>
            <label className="wedding-checkbox">
              <input
                type="checkbox"
                checked={undecided}
                onChange={(e) => setUndecided(e.target.checked)}
              />
              Not decided yet
            </label>
          </div>
          <label>
            Overall wedding budget <small>(Optional)</small>
            <input
              name="budget"
              defaultValue={
                wedding?.budgetMinor === undefined
                  ? ""
                  : `${BigInt(wedding.budgetMinor) / 100n}.${(BigInt(wedding.budgetMinor) % 100n).toString().padStart(2, "0")}`
              }
              inputMode="decimal"
              placeholder="e.g. 500000"
              maxLength={24}
              {...invalid("budgetMinor")}
            />
            {message("budgetMinor")}
            <small>
              Enter an amount in {currency}, without commas. You can leave this
              blank.
            </small>
          </label>
        </div>
      </fieldset>
      <aside className="wedding-notice">
        <WeddingIcon name="shield" />
        <div>
          <strong>Private by design</strong>
          <p>
            {wedding
              ? "Saving these details does not publish your wedding page or change anyone’s access."
              : "Only you have access for now. You can invite your partner later. Your public wedding page stays unpublished."}
          </p>
        </div>
      </aside>
      {pending && (
        <p className="wedding-saving-note" role="status">
          <span className="wedding-spinner" />
          Saving your private wedding workspace…
        </p>
      )}
      {error && (
        <div role="alert" className="wedding-error">
          <WeddingIcon name="alert" />
          <div>
            <strong>
              {uncertain
                ? "Connection interrupted"
                : "Please review your details"}
            </strong>
            <p>{error}</p>
          </div>
        </div>
      )}
      <div className="wedding-actions">
        {wedding ? (
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={() => {
              if (discard()) router.push("/wedding");
            }}
          >
            Cancel
          </button>
        ) : (
          <Link href="/account">
            <WeddingIcon name="back" /> Back to account
          </Link>
        )}
        {conflict ? (
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              if (discard()) window.location.reload();
            }}
          >
            Reload latest details
          </button>
        ) : (
          <button
            type="submit"
            className="button button-primary"
            disabled={pending}
          >
            {pending && <span className="wedding-spinner" />}
            {pending
              ? wedding
                ? "Saving changes…"
                : "Creating your wedding…"
              : error
                ? "Retry"
                : wedding
                  ? "Save changes"
                  : "Create wedding"}
            {!pending && <WeddingIcon name={error ? "retry" : "arrow"} />}
          </button>
        )}
      </div>
    </form>
  );
}
