import { BrandLogo } from "@/components/branding/brand-logo";

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6">
      <BrandLogo variant="full" size="lg" priority className="max-w-[320px]" />
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <span>Loading your workspace...</span>
      </div>
    </div>
  );
}
