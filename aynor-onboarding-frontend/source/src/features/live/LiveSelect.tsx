import type { SelectHTMLAttributes } from "react";
export function Select({
  label,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select aria-label={label} {...props} />
    </label>
  );
}
