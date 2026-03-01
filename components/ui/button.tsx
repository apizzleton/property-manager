import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/* ============================================================================
   Button Component
   Variants: default, destructive, outline, secondary, ghost, link
   Sizes: default, sm, lg, icon
   ============================================================================ */

// Variant style maps
const variantStyles: Record<string, string> = {
  default: "neo-elevated neo-pressable bg-primary text-primary-foreground hover:bg-primary/95",
  destructive: "neo-elevated neo-pressable bg-destructive text-destructive-foreground hover:bg-destructive/95",
  outline: "neo-elevated neo-pressable border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  secondary: "neo-elevated neo-pressable bg-secondary text-secondary-foreground hover:bg-secondary/90",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  link: "text-primary underline-offset-4 hover:underline",
  success: "neo-elevated neo-pressable bg-success text-success-foreground hover:bg-success/95",
};

// Size style maps
const sizeStyles: Record<string, string> = {
  default: "h-9 px-4 py-2",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-8",
  icon: "h-9 w-9",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
