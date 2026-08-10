import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * LdySSH 基础 UI 组件库
 * 升级为 Modern SaaS & Terminal 极客视觉规范：
 * - 按钮：优雅圆角 (rounded-lg)，微光边框，柔和悬浮态，消除臃肿球形气泡感
 * - 空状态 (EmptyState)：高级半透明玻璃面板与柔和阴影，消除粗糙的虚线框
 * - 面板 (Panel)：轻量层级分割与平滑过渡
 */

type ButtonVariant = "primary" | "secondary" | "outline" | "default" | "ghost";
type ButtonSize = 26 | 32 | 44;

export function Button({
  className,
  variant = "default",
  size = 32,
  danger = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  danger?: boolean;
}) {
  const resolved = variant === "default" ? "primary" : variant === "ghost" ? "secondary" : variant;

  const sizeClass =
    size === 44
      ? "h-11 min-w-[70px] gap-2 rounded-full px-5 text-sm font-extrabold tracking-wide"
      : size === 26
        ? "h-8 min-w-[40px] gap-1.5 rounded-full px-3 text-xs font-bold"
        : "h-10 min-w-[56px] gap-2 rounded-full px-4.5 text-xs font-extrabold tracking-wide";

  const variantClass =
    resolved === "primary"
      ? danger
        ? "bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-500/20"
        : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-md shadow-slate-950/15 dark:shadow-emerald-500/25"
      : resolved === "outline"
        ? danger
          ? "border border-rose-200 bg-transparent text-rose-600 hover:bg-rose-50"
          : "border border-[var(--app-line)] bg-[var(--panel-bg)] text-[var(--app-text)] hover:bg-[var(--fill-1)] hover:border-[var(--accent)] shadow-2xs"
        : danger
          ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
          : "bg-[var(--fill-1)] text-[var(--app-text)] hover:bg-[var(--fill-2)]";

  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap cursor-pointer select-none",
        "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.02] active:translate-y-0 active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-40",
        sizeClass,
        variantClass,
        className
      )}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10.5 w-full rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] px-4 text-sm font-medium text-[var(--app-text)] outline-none shadow-2xs transition-all duration-200",
        "placeholder:text-[var(--app-muted)]",
        "focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]",
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-24 w-full rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)] px-4 py-3 text-sm leading-6 font-medium text-[var(--app-text)] outline-none shadow-2xs transition-all duration-200",
        "placeholder:text-[var(--app-muted)]",
        "focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]",
        props.className
      )}
    />
  );
}

export function Panel({
  title,
  children,
  className,
  action
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)]/90 shadow-sm backdrop-blur-sm overflow-hidden", className)}>
      {(title || action) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--app-line)] px-4.5 bg-[var(--fill-1)]/50">
          <div className="text-xs font-semibold tracking-wide text-[var(--app-text)]">{title}</div>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-44 max-w-lg flex-col items-center justify-center rounded-2xl border border-[var(--app-line)] bg-[var(--panel-bg)]/80 px-8 py-10 text-center shadow-md backdrop-blur-md">
      <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <span className="absolute inset-0 rounded-xl bg-[var(--accent)]/10 blur-sm" />
        <svg className="relative h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      <div className="text-sm font-semibold text-[var(--app-text)]">{title}</div>
      <p className="mt-1.5 max-w-xs text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
