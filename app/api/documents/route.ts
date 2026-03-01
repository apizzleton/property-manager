import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { resolvePropertyIdsForFilter } from "@/lib/portfolioScope";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

/**
 * GET /api/documents — list all documents
 * Query: propertyId?, portfolioId?
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("propertyId");
  const portfolioId = searchParams.get("portfolioId");

  let propertyFilter: { propertyId?: string | { in: string[] } } = {};
  if (portfolioId) {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    const ids = await resolvePropertyIdsForFilter(actor.user.id, portfolioId, propertyId);
    if (ids !== null) {
      propertyFilter = ids.length === 0 ? { propertyId: { in: [] } } : { propertyId: { in: ids } };
    }
  } else if (propertyId) {
    propertyFilter = { propertyId };
  }

  const documents = await prisma.document.findMany({
    where: Object.keys(propertyFilter).length > 0 ? propertyFilter : undefined,
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      tenant: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(documents);
}

/**
 * POST /api/documents — upload a document (stores on local filesystem)
 * Expects multipart/form-data with: file, name, category, propertyId?, unitId?, tenantId?
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string;
    const category = formData.get("category") as string | null;
    const propertyId = formData.get("propertyId") as string | null;
    const unitId = formData.get("unitId") as string | null;
    const tenantId = formData.get("tenantId") as string | null;

    if (!file || !name) {
      return NextResponse.json({ error: "File and name are required" }, { status: 400 });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadsDir, { recursive: true });

    // Generate unique filename
    const ext = path.extname(file.name);
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Save document record in database
    const document = await prisma.document.create({
      data: {
        name,
        filePath: `/uploads/${uniqueName}`,
        fileType: file.type,
        fileSize: file.size,
        category: category || null,
        propertyId: propertyId || null,
        unitId: unitId || null,
        tenantId: tenantId || null,
      },
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
        tenant: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
  }
}
