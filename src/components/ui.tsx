import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Small, dependency-free primitives. Variants encode meaning (primary action,
// secondary action, destructive) rather than decoration.

type Variant = "primary" | "secondary" | "quiet" | "danger";

const variantClass: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-soft disabled:bg-ink/40",
  secondary: "bg-paper text-ink border border-paper-line hover:border-ink-mute disabled:text-ink-mute",
  quiet: "bg-transparent text-ink-soft hover:text-ink hover:bg-ink/5",
  danger: "bg-paper text-alert border border-alert/40 hover:bg-alert-soft",
};

export function Button({
  variant = "primary",
  busy = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed ${variantClass[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}

/** Label + control + hint/error, wired together for screen readers. */
export function Field({ id, label, hint, error, optional, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-medium">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-mute">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[15px] text-alert" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[15px] text-ink-mute">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Pass `error` and `hasHint` so aria-describedby matches the surrounding Field. */
export function TextInput({ error, hasHint, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { error?: string; hasHint?: boolean }) {
  return (
    <input
      id={id}
      className="input"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : hasHint ? `${id}-hint` : undefined}
      {...rest}
    />
  );
}

export function TextArea({ error, hasHint, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string; hasHint?: boolean }) {
  return (
    <textarea
      id={id}
      className="input min-h-[96px]"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : hasHint ? `${id}-hint` : undefined}
      {...rest}
    />
  );
}

export function Select({ error, hasHint, id, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { error?: string; hasHint?: boolean }) {
  return (
    <select
      id={id}
      className="input"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : hasHint ? `${id}-hint` : undefined}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "success" | "error"; children: ReactNode }) {
  const cls = {
    info: "bg-paper border-paper-line text-ink-soft",
    success: "bg-avail-soft border-avail/30 text-avail-strong",
    error: "bg-alert-soft border-alert/30 text-alert",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 ${cls}`}>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg bg-paper p-6 shadow-card sm:p-8 ${className}`}>{children}</section>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-ink-mute" role="status">
      <Spinner /> {label}…
    </p>
  );
}
