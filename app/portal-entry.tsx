"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ManagementPortal } from "./management-portal";
import { RegistrationForm } from "./registration-form";
import Link from "next/link";
import type { PortalActor } from "./lib/portal-auth";
import type { BusinessRow } from "./lib/business-workflow";
type State = {
  actor: PortalActor | null;
  initialized: boolean;
  local: boolean;
  error?: string;
};
export function PortalEntry({
  student = false,
  register = false,
  initialView,
}: {
  student?: boolean;
  register?: boolean;
  initialView?:
    | "dashboard"
    | "courses"
    | "students"
    | "teachers"
    | "classrooms"
    | "calendar"
    | "enrollment";
}) {
  const [state, setState] = useState<State | null>(null),
    [mode, setMode] = useState(register ? "register" : "login"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const response = await fetch("/api/auth", { cache: "no-store" });
      const body = (await response.json()) as State;
      setState(body);
      if (!response.ok) setError(body.error || "Unable to open the portal.");
    } catch {
      setError("The portal could not be reached. Refresh to try again.");
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function submit(values: BusinessRow) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Unable to continue.");
        return false;
      }
      await load();
      return true;
    } catch {
      setError("Unable to reach the portal. Your form is still here.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (state?.actor)
    return (
      <ManagementPortal
        initialRole={
          state.actor.role === "admin" && student ? "student" : state.actor.role
        }
        initialView={
          state.actor.role === "student" ||
          (state.actor.role === "admin" && student)
            ? "studentHome"
            : state.actor.role === "teacher"
              ? "teacherHome"
              : initialView || "dashboard"
        }
        actor={state.actor}
        onLogout={async () => {
          await submit({ action: "logout" });
        }}
      />
    );
  if (!state && !error)
    return (
      <main className="auth-shell">
        <p role="status">Opening the teaching portal…</p>
      </main>
    );
  const bootstrap = state && !state.initialized;
  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit({
      ...Object.fromEntries(new FormData(event.currentTarget)),
      action: bootstrap ? "bootstrap" : "login",
    });
  }
  return (
    <main
      className={`auth-shell ${mode === "register" && !bootstrap ? "auth-registration" : ""}`}
    >
      <Link className="auth-brand" href="/">
        UniqGuru Pintar
      </Link>
      <h1>
        {bootstrap
          ? "Set up your administrator account"
          : mode === "register"
            ? "Student registration"
            : "Welcome back"}
      </h1>
      <p>
        {bootstrap
          ? "Create the first campus administrator."
          : mode === "register"
            ? "Submit your details for campus review."
            : "Sign in to your teaching and learning portal."}
      </p>
      {error ? (
        <p role="alert" className="workflow-error">
          {error}
        </p>
      ) : null}
      {state?.error ? null : mode === "register" && !bootstrap ? (
        <RegistrationForm
          account
          busy={busy}
          onSubmit={(values) => submit({ ...values, action: "register" })}
        />
      ) : (
        <form onSubmit={signIn} className="auth-form">
          {bootstrap ? (
            <label className="form-field">
              <span>Administrator name</span>
              <input name="name" required autoComplete="name" />
            </label>
          ) : null}
          <label className="form-field">
            <span>Email</span>
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              minLength={bootstrap ? 12 : undefined}
              maxLength={256}
              required
              autoComplete={bootstrap ? "new-password" : "current-password"}
            />
          </label>
          {bootstrap && !state?.local ? (
            <label className="form-field">
              <span>Server bootstrap key</span>
              <input
                name="secret"
                type="password"
                required
                autoComplete="off"
              />
            </label>
          ) : null}
          <button className="primary-button" disabled={busy} type="submit">
            {busy
              ? "Please wait…"
              : bootstrap
                ? "Create administrator"
                : "Sign in"}
          </button>
        </form>
      )}
      {state?.initialized ? (
        <button
          className="quiet-button"
          onClick={() => {
            setError("");
            setMode(mode === "register" ? "login" : "register");
          }}
          type="button"
        >
          {mode === "register"
            ? "Already registered? Sign in"
            : "New student? Register"}
        </button>
      ) : null}
    </main>
  );
}
