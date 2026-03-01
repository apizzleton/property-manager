import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

/**
 * GET /api/settings/contact-info
 * Returns contact info for the current property manager.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    if (actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Only property managers can view contact info" }, { status: 403 });
    }

    const profile = await prisma.propertyManagerProfile.findUnique({
      where: { userId: actor.user.id },
    });

    return NextResponse.json({
      mailingAddress: profile?.mailingAddress ?? "",
      emailAddress: profile?.emailAddress ?? actor.user.email ?? "",
      phoneNumber: profile?.phoneNumber ?? "",
      emergencyNumber: profile?.emergencyNumber ?? "",
    });
  } catch (error) {
    console.error("Error loading manager contact info:", error);
    return NextResponse.json({ error: "Failed to load contact info" }, { status: 500 });
  }
}

/**
 * PUT /api/settings/contact-info
 * Body: { mailingAddress, emailAddress, phoneNumber, emergencyNumber }
 */
export async function PUT(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    if (actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Only property managers can update contact info" }, { status: 403 });
    }

    const body = await request.json();
    const mailingAddress = typeof body.mailingAddress === "string" ? body.mailingAddress.trim() : "";
    const emailAddress = typeof body.emailAddress === "string" ? body.emailAddress.trim() : "";
    const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
    const emergencyNumber = typeof body.emergencyNumber === "string" ? body.emergencyNumber.trim() : "";

    const updated = await prisma.propertyManagerProfile.upsert({
      where: { userId: actor.user.id },
      update: {
        mailingAddress: mailingAddress || null,
        emailAddress: emailAddress || null,
        phoneNumber: phoneNumber || null,
        emergencyNumber: emergencyNumber || null,
      },
      create: {
        userId: actor.user.id,
        mailingAddress: mailingAddress || null,
        emailAddress: emailAddress || null,
        phoneNumber: phoneNumber || null,
        emergencyNumber: emergencyNumber || null,
      },
    });

    return NextResponse.json({
      mailingAddress: updated.mailingAddress ?? "",
      emailAddress: updated.emailAddress ?? "",
      phoneNumber: updated.phoneNumber ?? "",
      emergencyNumber: updated.emergencyNumber ?? "",
    });
  } catch (error) {
    console.error("Error saving manager contact info:", error);
    return NextResponse.json({ error: "Failed to save contact info" }, { status: 500 });
  }
}
