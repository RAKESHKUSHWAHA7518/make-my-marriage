"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { announceSessionChange } from "./session-sync";

type Mode =
  | "login"
  | "register"
  | "forgot-password"
  | "reset-password"
  | "verify-email";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const subscribeHash = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
const readToken = () =>
  new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
const emptyToken = () => "";

const content: Record<
  Mode,
  { title: string; description: string; action: string }
> = {
  login: {
    title: "Welcome back",
    description: "Sign in to continue planning with your family.",
    action: "Log in",
  },
  register: {
    title: "Your story starts here",
    description: "Create your account for a wedding planned together.",
    action: "Create account",
  },
  "forgot-password": {
    title: "Forgot your password?",
    description:
      "Enter your email address to request password reset instructions.",
    action: "Send reset link",
  },
  "reset-password": {
    title: "A fresh start",
    description: "Choose a new password for your account.",
    action: "Reset password",
  },
  "verify-email": {
    title: "Verify your email",
    description:
      "You’ll need to verify your email before creating a wedding or inviting family.",
    action: "Resend verification email",
  },
};

/** Forms call only the documented same-origin account contracts. */
export function AccountForm({ mode }: { mode: Mode }) {
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  const router = useRouter();
  const linkToken = useSyncExternalStore(subscribeHash, readToken, emptyToken);
  const hasToken = /^[A-Za-z0-9_-]{43}$/.test(linkToken);
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const feedback = useRef<HTMLDivElement>(null);
  const copy = content[mode];
  const hasPassword = ["login", "register", "reset-password"].includes(mode);
  const newPassword = mode !== "login";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const next: Record<string, string> = {};
    if (mode === "register" && !String(data.get("displayName") ?? "").trim()) {
      next.displayName = "Please enter your name.";
    }
    if (
      mode !== "reset-password" &&
      !(mode === "verify-email" && hasToken) &&
      !z.email().safeParse(String(data.get("email") ?? "").trim()).success
    ) {
      next.email = "Please enter a valid email address.";
    }
    const password = String(data.get("password") ?? "");
    if (
      hasPassword &&
      (!password ||
        (newPassword && password.length < 12) ||
        password.length > 128)
    ) {
      next.password = newPassword
        ? "Use between 12 and 128 characters."
        : "Please enter your password (up to 128 characters).";
    }
    if (
      mode === "register" &&
      password !== String(data.get("confirmPassword") ?? "")
    ) {
      next.confirmPassword = "Your passwords do not match.";
    }
    setErrors(next);
    setNotice("");
    const first = Object.keys(next)[0];
    if (first) {
      (form.elements.namedItem(first) as HTMLInputElement | null)?.focus();
      return;
    }
    if (mode === "reset-password" && !hasToken) {
      setNotice(
        "Open a valid reset link from your email, or request a new one.",
      );
      return;
    }
    setPending(true);
    try {
      const email = String(data.get("email") ?? "").trim();
      const action =
        mode === "verify-email" && !hasToken ? "resend-verification" : mode;
      const payload =
        mode === "register"
          ? {
              displayName: String(data.get("displayName") ?? "").trim(),
              email,
              password,
            }
          : mode === "login"
            ? { email, password }
            : mode === "reset-password"
              ? { token: linkToken, newPassword: password }
              : mode === "verify-email" && hasToken
                ? { token: linkToken }
                : { email };
      const response = await fetch("/api/v1/auth/" + action, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok) {
        const fields: Record<string, string> = {};
        for (const field of result.error?.fields ?? [])
          fields[field.path === "newPassword" ? "password" : field.path] =
            field.message;
        setErrors(fields);
        setNotice(
          result.error?.message ??
            "We couldn’t complete this request. Please try again.",
        );
      } else if (mode === "login") {
        announceSessionChange("signed-in");
        form.reset();
        router.replace("/wedding");
        router.refresh();
      } else {
        form.reset();
        setVisible(false);
        if (
          mode === "reset-password" ||
          (mode === "verify-email" && hasToken)
        ) {
          window.history.replaceState(null, "", window.location.pathname);
          setCompleted(true);
          if (mode === "reset-password") announceSessionChange("signed-out");
        }
        setNotice(
          mode === "reset-password"
            ? "Your password has been reset. Please log in with your new password."
            : mode === "verify-email" && hasToken
              ? "Your email is verified. You can now log in."
              : "If this address is eligible, you will receive an email with the next steps. Please check your inbox and spam folder.",
        );
      }
    } catch {
      setNotice(
        "We couldn’t connect. Please check your connection and try again. If you were registering, you can also try resending the verification email.",
      );
    } finally {
      setPending(false);
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }

  function fieldError(name: string) {
    return errors[name] ? (
      <p id={`${name}-error`} className="auth-error">
        {errors[name]}
      </p>
    ) : null;
  }

  return (
    <div className="auth-form-wrap">
      {mode !== "login" && (
        <Link className="auth-back" href="/login">
          ← Back to log in
        </Link>
      )}
      <h1>{copy.title}</h1>
      <p className="auth-description">{copy.description}</p>
      {mode === "reset-password" && !hasToken && !completed && (
        <p className="auth-link-note">
          Open the reset link from your email.{" "}
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      )}
      <form onSubmit={submit} noValidate aria-busy={pending}>
        <fieldset
          disabled={
            !hydrated ||
            pending ||
            completed ||
            (mode === "reset-password" && !hasToken)
          }
        >
          <legend className="auth-visually-hidden">{copy.title}</legend>
          {mode === "register" && (
            <div className="auth-field">
              <label htmlFor="displayName">Your name</label>
              <input
                id="displayName"
                name="displayName"
                maxLength={200}
                autoComplete="name"
                placeholder="Your full name"
                required
                aria-invalid={Boolean(errors.displayName)}
                aria-describedby={
                  errors.displayName ? "displayName-error" : undefined
                }
              />
              {fieldError("displayName")}
            </div>
          )}
          {mode !== "reset-password" &&
            !(mode === "verify-email" && hasToken) && (
              <div className="auth-field">
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="you@example.com"
                  required
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
                {fieldError("email")}
              </div>
            )}
          {hasPassword && (
            <div className="auth-field">
              <div className="auth-label-row">
                <label htmlFor="password">
                  {newPassword ? "New password" : "Password"}
                </label>
                {mode === "login" && (
                  <Link href="/forgot-password">Forgot password?</Link>
                )}
              </div>
              <div className="auth-password">
                <input
                  id="password"
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete={
                    newPassword ? "new-password" : "current-password"
                  }
                  placeholder={
                    newPassword
                      ? "At least 12 characters"
                      : "Enter your password"
                  }
                  required
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password
                      ? "password-error"
                      : newPassword
                        ? "password-hint"
                        : undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => setVisible(!visible)}
                  aria-label={visible ? "Hide password" : "Show password"}
                  aria-pressed={visible}
                >
                  {visible ? "Hide" : "Show"}
                </button>
              </div>
              {newPassword && (
                <p id="password-hint" className="auth-hint">
                  Use 12–128 characters. A memorable passphrase works well.
                </p>
              )}
              {fieldError("password")}
            </div>
          )}
          {mode === "register" && (
            <div className="auth-field">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                required
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={
                  errors.confirmPassword ? "confirmPassword-error" : undefined
                }
              />
              {fieldError("confirmPassword")}
            </div>
          )}
          <button className="button button-primary auth-submit" type="submit">
            {pending
              ? "Please wait…"
              : mode === "verify-email" && hasToken
                ? "Verify my email"
                : copy.action}
            <span aria-hidden="true">→</span>
          </button>
        </fieldset>
        <noscript>
          <p>
            This form needs JavaScript to submit securely. No information has
            been submitted.
          </p>
        </noscript>
        <div
          ref={feedback}
          tabIndex={-1}
          role="status"
          className={notice ? "auth-feedback" : undefined}
        >
          {notice}
        </div>
      </form>
      {mode === "login" && (
        <p className="auth-switch">
          New to Make My Marriage?{" "}
          <Link href="/register">Create an account</Link>
        </p>
      )}
      {mode === "register" && (
        <p className="auth-switch">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      )}
      {(mode === "verify-email" || completed) && (
        <p className="auth-switch">
          Already verified? <Link href="/login">Log in</Link>
        </p>
      )}
      {(mode === "register" || mode === "login") && (
        <p className="auth-switch">
          <Link href="/verify-email">Resend verification email</Link>
        </p>
      )}
      <aside className="auth-guest-note">
        <strong>Here as an invited guest?</strong>
        <p>
          Open your private invitation or shared gallery link directly. You
          won’t need an account.
        </p>
      </aside>
    </div>
  );
}
