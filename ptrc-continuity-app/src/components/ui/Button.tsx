"use client";

import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "md" | "lg" | "xl";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-[var(--accent)] text-[var(--accent-contrast)] active:brightness-90",
  secondary: "bg-[var(--surface-raised)] text-[var(--text)] border border-[var(--border)] active:brightness-95",
  ghost: "bg-transparent text-[var(--text)] active:bg-[var(--surface-raised)]",
  danger: "bg-[var(--danger)] text-white active:brightness-90",
  success: "bg-[var(--success)] text-white active:brightness-90",
};

const sizeClasses: Record<Size, string> = {
  md: "h-11 px-4 text-sm rounded-xl",
  lg: "h-14 px-5 text-base rounded-2xl",
  xl: "h-20 px-6 text-lg rounded-2xl",
};

export function Button({
  variant = "primary",
  size = "lg",
  fullWidth,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "tap-target inline-flex items-center justify-center gap-2 font-semibold tracking-wide select-none",
        "transition-transform active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    />
  );
}
