"use client";
import { useState, type FormEvent } from "react";
import {
  registrationFields,
  validateRegistration,
  RegistrationError,
  type BusinessRow,
} from "./lib/business-workflow";
type Props = {
  initial?: BusinessRow;
  busy?: boolean;
  account?: boolean;
  onSubmit: (values: BusinessRow) => Promise<boolean>;
  submitLabel?: string;
};
export function RegistrationForm({
  initial = {},
  busy = false,
  account = false,
  onSubmit,
  submitLabel = "Submit registration",
}: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [school, setSchool] = useState(String(initial.schoolSystem || "sjk"));
  const [saving, setSaving] = useState(false);
  const levels =
    school === "sjk" || school === "sk"
      ? ["G1", "G2", "G3", "G4", "G5", "G6"]
      : school === "smk"
        ? ["F1", "F2", "F3", "F4", "F5", "F6"]
        : ["J1", "J2", "J3", "S1", "S2", "S3"];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    setErrors({});
    try {
      validateRegistration(values);
    } catch (error) {
      if (error instanceof RegistrationError) {
        setErrors(error.fields);
        form
          .querySelector<HTMLElement>(
            `[name="${Object.keys(error.fields)[0]}"]`,
          )
          ?.focus();
      }
      return;
    }
    setSaving(true);
    try {
      if (!(await onSubmit({ ...values, studentId: initial.student_id })))
        setErrors({
          form: "The details were not saved. Review the message above and try again.",
        });
    } catch (cause) {
      setErrors({
        form:
          cause instanceof Error
            ? cause.message
            : "Unable to save these details. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }
  function field(key: string, label: string, required: boolean) {
    const identifier = `registration-${key}`;
    const date = ["dateOfBirth", "enrollmentDate", "guardianBirth"].includes(
      key,
    );
    const options =
      key === "schoolSystem"
        ? [
            ["sjk", "SJK primary school"],
            ["sk", "SK primary school"],
            ["smk", "SMK secondary school"],
            ["independent", "Chinese independent high school"],
          ]
        : key === "level"
          ? levels.map((v) => [v, v])
          : key === "gender" || key === "guardianGender"
            ? [
                ["female", "Female"],
                ["male", "Male"],
                ["other", "Other"],
              ]
            : null;
    return (
      <label className="form-field" key={key} htmlFor={identifier}>
        <span>
          {label}
          {required ? " *" : ""}
        </span>
        {options ? (
          <select
            key={key === "level" ? school : key}
            id={identifier}
            name={key}
            required={required}
            defaultValue={String(
              initial[key] || (key === "schoolSystem" ? school : ""),
            )}
            onChange={
              key === "schoolSystem"
                ? (event) => setSchool(event.target.value)
                : undefined
            }
            aria-invalid={Boolean(errors[key])}
          >
            <option value="">Choose</option>
            {options.map(([value, title]) => (
              <option value={value} key={value}>
                {title}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={identifier}
            name={key}
            type={
              date
                ? "date"
                : key.toLowerCase().includes("email")
                  ? "email"
                  : key.toLowerCase().includes("phone")
                    ? "tel"
                    : "text"
            }
            required={required}
            defaultValue={String(
              initial[key] ||
                (key === "enrollmentDate"
                  ? new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Kuala_Lumpur",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).format(new Date())
                  : ""),
            )}
            maxLength={2000}
            aria-invalid={Boolean(errors[key])}
          />
        )}{" "}
        {errors[key] ? (
          <small className="workflow-error">{errors[key]}</small>
        ) : null}
      </label>
    );
  }
  return (
    <form className="workflow-registration" onSubmit={submit}>
      <fieldset disabled={busy || saving}>
        <legend>Student information</legend>
        <p className="workflow-muted">
          Fields marked * are required. School system and year are also needed
          to determine booking eligibility.
        </p>
        <div className="workflow-form-grid">
          {registrationFields
            .slice(0, 12)
            .map(([key, label, required]) => field(key, label, required))}
        </div>
      </fieldset>
      <fieldset disabled={busy || saving}>
        <legend>Guardian information</legend>
        <div className="workflow-form-grid">
          {registrationFields
            .slice(12)
            .map(([key, label, required]) => field(key, label, required))}
        </div>
      </fieldset>
      {account ? (
        <fieldset disabled={busy || saving}>
          <legend>Your account</legend>
          <label className="form-field">
            <span>Password *</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              required
            />
            <small>
              Use at least 12 characters. Sign in using your student email.
            </small>
          </label>
        </fieldset>
      ) : null}
      {errors.form ? (
        <p role="alert" className="workflow-error">
          {errors.form}
        </p>
      ) : null}
      <button
        className="primary-button"
        type="submit"
        disabled={busy || saving}
      >
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
