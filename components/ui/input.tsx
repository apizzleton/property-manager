import * as React from "react";
import { cn } from "@/lib/utils";

/* ============================================================================
   Input Component — styled text input with consistent theming
   ============================================================================ */

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Keep inputs inset so form fields read as touchable cavities.
          "neo-inset flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm",
          "transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-[var(--neo-shadow-raised-sm)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
