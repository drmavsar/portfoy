import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "btn-prim",
  secondary: "",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const SIZE: Record<ButtonSize, string> = { sm: "btn-sm", md: "", lg: "btn-lg" };

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="spinner" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Yükleniyor: simge yerine dönen gösterge, düğme devre dışı ve aria-busy. */
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

/** Tek düğme ailesi. Sayfa başına tek `primary`. Yükseklik 32 / 40 / 48 px (mobilde en az 44). */
export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  block,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = ["btn", VARIANT[variant], SIZE[size], block ? "btn-block" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button {...rest} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
