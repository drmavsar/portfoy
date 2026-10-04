"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

/**
 * Form alanı: etiket her zaman alanın üstünde (yer tutucu etiket yerine geçmez),
 * hata alanın altında metin + simgeyle. Çocuk öğeye id, aria-invalid ve
 * aria-describedby bağlanır.
 */
export function Field({
  label,
  optional,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error || hint ? msgId : undefined,
      })
    : children;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {optional && <span className="opt"> · isteğe bağlı</span>}
      </label>
      {control}
      {error ? (
        <span className="field-error" id={msgId}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <circle cx="7" cy="7" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M7 4v3.6M7 9.8v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {error}
        </span>
      ) : (
        hint && (
          <span className="field-hint" id={msgId}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}
