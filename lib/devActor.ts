import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type DevRole = "property_manager" | "tenant";

export interface DevActor {
  requestedRole: DevRole;
  effectiveRole: DevRole;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  tenantId: string | null;
}

function parseRequestedRole(raw: string | undefined): DevRole {
  return raw === "tenant" ? "tenant" : "property_manager";
}

/**
 * Resolve the current development actor from the role cookie.
 * This is intentionally dev-focused and falls back gracefully if a role
 * specific account is missing.
 */
export async function getDevActor(request?: NextRequest): Promise<DevActor | null> {
  const roleFromRequest = request?.cookies.get("dev_role")?.value;
  const cookieStore = await cookies();
  const roleFromStore = cookieStore.get("dev_role")?.value;
  const requestedRole = parseRequestedRole(roleFromRequest ?? roleFromStore);

  const [managerUser, tenantUser] = await Promise.all([
    prisma.user.findFirst({
      where: { role: { in: ["landlord", "admin"] } },
      include: { tenant: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findFirst({
      where: {
        OR: [
          { role: "tenant" },
          { tenant: { isNot: null } },
        ],
      },
      include: { tenant: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!managerUser && !tenantUser) {
    return null;
  }

  const selectedUser =
    requestedRole === "tenant"
      ? (tenantUser ?? managerUser)
      : (managerUser ?? tenantUser);

  if (!selectedUser) {
    return null;
  }

  const effectiveRole =
    selectedUser.role === "tenant" || selectedUser.tenant
      ? "tenant"
      : "property_manager";

  return {
    requestedRole,
    effectiveRole,
    user: {
      id: selectedUser.id,
      name: selectedUser.name,
      email: selectedUser.email,
      role: selectedUser.role,
    },
    tenantId: selectedUser.tenant?.id ?? null,
  };
}
