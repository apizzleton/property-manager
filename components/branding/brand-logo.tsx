import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  variant?: "icon" | "full";
  size?: "sm" | "md" | "lg";
  className?: string;
  priority?: boolean;
}

const sizeMap = {
  icon: {
    sm: "h-7 w-7",
    md: "h-9 w-9",
    lg: "h-12 w-12",
  },
  full: {
    sm: "h-8 w-auto",
    md: "h-10 w-auto",
    lg: "h-14 w-auto",
  },
} as const;

export function BrandLogo({
  variant = "full",
  size = "md",
  className,
  priority = false,
}: BrandLogoProps) {
  const src = variant === "icon" ? "/brand/logo-mark.svg" : "/brand/logo-full.svg";
  const alt = variant === "icon" ? "Property Management App logo mark" : "Property Management App";
  const width = variant === "icon" ? 128 : 820;
  const height = variant === "icon" ? 128 : 180;

  return (
    <div className={cn("relative shrink-0", sizeMap[variant][size], className)}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        className="object-contain"
        sizes={variant === "icon" ? "48px" : "280px"}
      />
    </div>
  );
}
