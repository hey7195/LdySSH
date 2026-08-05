import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * LdySSH 基础组件 —— 基于 Kimi Design System Web 规范
 * Button: components-web/button.md（尺寸 44/32/26，主/次/描边三变体）
 * Modal 结构: components-web/modal.md
 * 说明：primary 填充遵循规范使用 color.labels.primary（浅主题近黑 / 深主题近白），
 * 文字取反向表面色；指标（高度、圆角、间距、字号）全部来自规范矩阵。
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
  // 兼容旧命名：default → primary，ghost → secondary
  const resolved = variant === "default" ? "primary" : variant === "ghost" ? "secondary" : variant;

  const sizeClass =
    size === 44
      ? "h-11 min-w-[72px] gap-1.5 rounded-xl px-3.5 text-base font-medium"
      : size === 26
        ? "h-[26px] min-w-[52px] gap-0.5 rounded-lg px-2 text-xs font-medium"
        : "h-8 min-w-[62px] gap-1 rounded-[10px] px-2.5 text-sm font-medium";

  const variantClass =
    resolved === "primary"
      ? danger
        ? "bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)]"
        : "btn-primary-grad"
      : resolved === "outline"
        ? danger
          ? "border border-[var(--app-line)] text-[var(--danger-text)] hover:bg-[var(--danger-soft)]"
          : "border border-[var(--app-line)] text-[var(--app-text)] hover:bg-[var(--fill-1)]"
        : danger
          ? "bg-[var(--fill-1)] text-[var(--danger-text)] hover:bg-[var(--fill-2)]"
          : "bg-[var(--fill-1)] text-[var(--app-text)] hover:bg-[var(--fill-2)]";

  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap",
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
        "h-8 w-full rounded-[10px] border border-[var(--app-line)] bg-[var(--panel-bg)] px-2.5 text-sm text-[var(--app-text)] outline-none",
        "placeholder:text-[var(--app-muted)]",
        "focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
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
        "min-h-20 w-full rounded-[10px] border border-[var(--app-line)] bg-[var(--panel-bg)] px-2.5 py-2 text-sm leading-5 text-[var(--app-text)] outline-none",
        "placeholder:text-[var(--app-muted)]",
        "focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
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
    <section className={cn("rounded-xl border border-[var(--app-line)] bg-[var(--panel-bg)]", className)}>
      {(title || action) && (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--app-line)] px-4">
          <div className="text-sm font-medium text-[var(--app-text)]">{title}</div>
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
    <div className="mx-auto flex min-h-40 max-w-lg flex-col items-center justify-center rounded-xl border border-dashed border-[var(--app-line)] bg-[var(--fill-1)] px-8 py-10 text-center">
      <div className="text-base font-medium text-[var(--app-text)]">{title}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
