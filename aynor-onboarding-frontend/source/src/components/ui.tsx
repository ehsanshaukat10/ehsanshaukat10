import { createPortal } from "react-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  Layers3,
  Loader2,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={"logo " + (light ? "light" : "")}>
      <span className="logo-icon">
        <Layers3 size={21} strokeWidth={2.2} />
      </span>
      AYNOR<span className="logo-dot">®</span>
    </span>
  );
}
export function Button({
  children,
  busy = false,
  variant = "",
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: string;
}) {
  return (
    <button
      {...p}
      disabled={p.disabled || busy}
      className={`button ${variant} ${p.className || ""}`}
    >
      {busy ? <Loader2 className="spin" size={16} /> : null}
      {children}
    </button>
  );
}
export function Field({
  label,
  error,
  hint,
  ...p
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = p.id || generatedId;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {p.required && (
          <span aria-hidden="true" className="required">
            {" "}
            *
          </span>
        )}
      </label>
      <div className="input-wrap">
        <input
          {...p}
          data-filled={String(p.value ?? p.defaultValue ?? "").length > 0}
          id={id}
          aria-describedby={error || hint ? id + "-help" : undefined}
          aria-label={label}
          type={
            p.type === "password" ? (visible ? "text" : "password") : p.type
          }
          aria-invalid={!!error}
        />
        {p.type === "password" && (
          <button
            className="eye"
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {error ? (
        <small id={id + "-help"} className="error-text">
          {error}
        </small>
      ) : hint ? (
        <small id={id + "-help"}>{hint}</small>
      ) : null}
    </div>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <span className="required"> *</span>}
      </span>
      <select
        data-filled={Boolean(value)}
        disabled={disabled}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}
export function ErrorBox({ children }: { children: ReactNode }) {
  return children ? (
    <div className="error-box" role="alert">
      {children}
    </div>
  ) : null;
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={"badge " + tone}>
      <i />
      {children}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const element = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        element.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab") {
        const nodes = focusable(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={element}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button aria-label="Close" className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Layers3 size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Tick({ selected }: { selected: boolean }) {
  return (
    <span className={"tick " + (selected ? "selected" : "")}>
      {selected && <Check size={13} />}
    </span>
  );
}
export function Arrow() {
  return <ArrowRight size={16} />;
}
export function External() {
  return <ArrowUpRight size={15} />;
}
