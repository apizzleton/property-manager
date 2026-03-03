import { BrandLogo } from "@/components/branding/brand-logo";

function SkeletonBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className ?? ""}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-8 p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <BrandLogo variant="icon" size="sm" />
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SkeletonBar className="h-28" />
        <SkeletonBar className="h-28" />
        <SkeletonBar className="h-28" />
        <SkeletonBar className="h-28" />
      </div>

      <div className="space-y-3 rounded-xl border border-border p-4">
        <SkeletonBar className="h-5 w-52" />
        <SkeletonBar className="h-4 w-72" />
        <SkeletonBar className="h-64 w-full" />
      </div>
    </div>
  );
}
