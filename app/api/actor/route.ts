import { NextRequest, NextResponse } from "next/server";
import { getDevActor } from "@/lib/devActor";

/**
 * GET /api/actor — return current dev actor (role, user) for client-side use
 */
export async function GET(request: NextRequest) {
  const actor = await getDevActor(request);
  if (!actor) {
    return NextResponse.json({ error: "No development user found" }, { status: 400 });
  }
  return NextResponse.json({
    effectiveRole: actor.effectiveRole,
    user: actor.user,
    tenantId: actor.tenantId,
  });
}
