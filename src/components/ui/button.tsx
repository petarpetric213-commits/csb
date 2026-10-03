"use client";

import React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "ghost" | "outline" | "destructive" | "link" | "success";
type Size = "xs" | "sm" | "default" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  secondary: "bg-accent text-accent-foreground hover:bg-accent/70 border border-border",
  ghost: "hover:bg-accent text-foreground",
  outline: "border border-input bg-transparent hover:bg-accent",
  destructive: "bg-danger text-white hover:bg-danger/90 shadow-sm",
  link: "text-primary underline-offset-4 hover:underline",
  success: "bg-success text-white hover:bg-success/90 shadow-sm",
};

const sizes: Record<Size, string> = {
  xs: "h-6 px-2 text-2xs gap-1",
  sm: "h-[30px] px-2.5 text-xs gap-1.5",
  default: "h-9 px-3.5 text-[13px] gap-2",
  icon: "h-9 w-9",
  "icon-sm": "h-7 w-7",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ variant = "default", size = "default", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
