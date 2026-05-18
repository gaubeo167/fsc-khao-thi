import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * IconButton — the standard table-action / row-action primitive.
 *
 * Five variants encode the role of the action at a glance:
 *
 *   default      Eye / Open / View detail
 *                white card → subtle accent on hover
 *   primary      Edit / "Open in editor"
 *                always blue tinted with blue border
 *   warning      Reset password / Suspend / Lock
 *                always amber tinted with amber border
 *   success      Activate / Approve
 *                always emerald tinted with emerald border
 *   destructive  Delete
 *                white card → red border + bg on hover
 *
 * Always wrap usage with a `title` prop so the affordance reads on hover.
 */
const VARIANTS = {
  default:
    "border-border bg-card text-foreground/65 hover:border-foreground/30 hover:bg-accent hover:text-foreground",
  primary:
    "border-blue-200 bg-blue-50 text-blue-600 hover:border-blue-300 hover:bg-blue-100 hover:text-blue-700",
  warning:
    "border-amber-200 bg-amber-50 text-amber-600 hover:border-amber-300 hover:bg-amber-100 hover:text-amber-700",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-600 hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700",
  destructive:
    "border-border bg-card text-foreground/65 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
} as const;

const SIZES = {
  sm: "h-7 w-7 rounded-md",
  md: "h-8 w-8 rounded-lg",
  lg: "h-9 w-9 rounded-lg",
} as const;

export type IconButtonVariant = keyof typeof VARIANTS;
export type IconButtonSize = keyof typeof SIZES;

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "default", size = "md", className, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border transition-all",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  ),
);
IconButton.displayName = "IconButton";
