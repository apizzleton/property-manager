import type { ComponentType } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CheckCircle,
  DollarSign,
  Home,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { getDevActor } from "@/lib/devActor";
import { TenantDashboard } from "@/components/tenant/tenant-dashboard";

/* ============================================================================
   Dashboard Page — overview stats, recent activity, quick actions
   ============================================================================ */

// Fetch manager dashboard statistics from the database.
async function getDashboardStats() {
  const [
    propertyCount,
    unitCount,
    tenantCount,
    activeLeaseCount,
    openWorkOrderCount,
    completedWorkOrderCount,
  ] = await Promise.all([
    prisma.property.count(),
    prisma.unit.count(),
    prisma.tenant.count(),
    prisma.lease.count({ where: { status: "active" } }),
    prisma.workOrder.count({ where: { status: { in: ["open", "in_progress"] } } }),
    prisma.workOrder.count({ where: { status: "completed" } }),
  ]);

  // Calculate vacancy: units without an active lease
  const occupiedUnits = await prisma.lease.findMany({
    where: { status: "active" },
    select: { unitId: true },
    distinct: ["unitId"],
  });
  const vacantUnits = unitCount - occupiedUnits.length;
  const occupancyRate = unitCount > 0 ? ((occupiedUnits.length / unitCount) * 100).toFixed(1) : "0";

  // Monthly income from active leases
  const activeLeases = await prisma.lease.findMany({
    where: { status: "active" },
    select: { monthlyRent: true },
  });
  const monthlyIncome = activeLeases.reduce((sum, l) => sum + l.monthlyRent, 0);

  return {
    propertyCount,
    unitCount,
    tenantCount,
    activeLeaseCount,
    openWorkOrderCount,
    completedWorkOrderCount,
    vacantUnits,
    occupancyRate,
    monthlyIncome,
  };
}

export default async function DashboardPage() {
  const actor = await getDevActor();
  if (!actor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          No development user found. Run the seed script to create demo users.
        </p>
      </div>
    );
  }

  if (actor.effectiveRole === "tenant" && actor.tenantId) {
    return <TenantDashboard />;
  }

  const stats = await getDashboardStats();

  // Stat cards — DoorLoop-style instant insights with varied colors for visual distinction
  const statCards = [
    {
      title: "Properties",
      value: stats.propertyCount,
      icon: Building2,
      description: `${stats.unitCount} total units`,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
      border: "border-l-4 border-blue-500",
      valueColor: "text-blue-700 dark:text-blue-300",
      href: "/properties",
    },
    {
      title: "Tenants",
      value: stats.tenantCount,
      icon: Users,
      description: `${stats.activeLeaseCount} active leases`,
      color: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300",
      border: "border-l-4 border-violet-500",
      valueColor: "text-violet-700 dark:text-violet-300",
      href: "/tenants",
    },
    {
      title: "Monthly Income",
      value: formatCurrency(stats.monthlyIncome),
      icon: DollarSign,
      description: "From active leases",
      color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
      border: "border-l-4 border-emerald-500",
      valueColor: "text-emerald-700 dark:text-emerald-300",
      href: "/accounting",
    },
    {
      title: "Occupancy Rate",
      value: `${stats.occupancyRate}%`,
      icon: TrendingUp,
      description: `${stats.vacantUnits} vacant units`,
      color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
      border: "border-l-4 border-indigo-500",
      valueColor: "text-indigo-700 dark:text-indigo-300",
      href: "/leases",
    },
    {
      title: "Open Work Orders",
      value: stats.openWorkOrderCount,
      icon: Wrench,
      description: "Needs attention",
      color: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
      border: "border-l-4 border-amber-500",
      valueColor: "text-amber-700 dark:text-amber-300",
      href: "/maintenance",
    },
    {
      title: "Completed",
      value: stats.completedWorkOrderCount,
      icon: CheckCircle,
      description: "Work orders completed",
      color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300",
      border: "border-l-4 border-cyan-500",
      valueColor: "text-cyan-700 dark:text-cyan-300",
      href: "/maintenance",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page header — DoorLoop-style clean typography */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/70 p-6 neo-surface">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_24%,transparent),transparent_58%)]" />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your property management portfolio.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{stats.propertyCount} properties</Badge>
          <Badge variant="secondary">{stats.activeLeaseCount} active leases</Badge>
          <Badge variant="secondary">{formatCurrency(stats.monthlyIncome)} monthly income</Badge>
        </div>
      </div>

      {/* Stat cards grid — instant insights */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <Link key={card.title} href={card.href} className="block">
            <Card className={`overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 ${card.border || ""}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div className={`rounded-lg p-2 ${card.color}`}>
                  <card.icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold tracking-tight ${card.valueColor}`}>
                  {card.value}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick actions and recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick Actions — work faster every day */}
        <Card className="neo-surface">
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Get more done in less time.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickAction
              icon={Building2}
              label="Add Property"
              href="/properties"
              color="bg-primary/20 text-primary"
            />
            <QuickAction
              icon={Users}
              label="Add Tenant"
              href="/tenants"
              color="bg-primary/20 text-primary"
            />
            <QuickAction
              icon={DollarSign}
              label="Record Payment"
              href="/accounting"
              color="bg-primary/20 text-primary"
            />
            <QuickAction
              icon={Wrench}
              label="Create Work Order"
              href="/maintenance"
              color="bg-primary/20 text-primary"
            />
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="neo-surface">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Latest updates across your portfolio.
            </p>
          </CardHeader>
          <CardContent>
            {stats.propertyCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Home className="mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No activity yet. Start by adding your first property.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <AlertTriangle className="mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Activity feed will populate as you manage your properties.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Quick action link component
function QuickAction({
  icon: Icon,
  label,
  href,
  color,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-border p-3 transition-all hover:border-primary/50 hover:bg-muted/50 hover:shadow-md"
    >
      <div className={`rounded-md p-2 transition-transform group-hover:scale-110 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium group-hover:text-primary transition-colors">{label}</span>
      <div className="ml-auto opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0">
        →
      </div>
    </Link>
  );
}
