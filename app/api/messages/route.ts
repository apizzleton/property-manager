import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

/**
 * GET /api/messages — get all messages (flat list, one running conversation per counterpart)
 * Returns every message the user sent or received, ordered chronologically.
 */
export async function GET(request: NextRequest) {
  const actor = await getDevActor(request);
  if (!actor) {
    return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
  }

  // Flat list: all messages (parent + replies) involving the current user
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: actor.user.id },
        { receiverId: actor.user.id },
      ],
    },
    include: {
      sender: { select: { id: true, name: true, email: true } },
      receiver: { select: { id: true, name: true, email: true } },
      property: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(messages);
}

/**
 * PATCH /api/messages — mark multiple messages as read
 * Body: { messageIds: string[] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { messageIds } = body;
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ error: "messageIds array required" }, { status: 400 });
    }
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found." }, { status: 400 });
    }
    await prisma.message.updateMany({
      where: {
        id: { in: messageIds },
        receiverId: actor.user.id,
      },
      data: { isRead: true },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking messages read:", error);
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
  }
}

/**
 * POST /api/messages — send a new message or reply
 * Body: { receiverId?, receiverIds?, subject?, body, propertyId?, parentId? }
 * - receiverIds: array of user IDs (for PM bulk send to multiple tenants)
 * - receiverId: single user ID (or used when replying)
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { receiverId, receiverIds, subject, body, propertyId, parentId } = data;

    if (!body) {
      return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    }

    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }

    let targetReceiverIds: string[] = [];

    // Bulk send: PM selects multiple tenants (receiverIds)
    if (receiverIds && Array.isArray(receiverIds) && receiverIds.length > 0) {
      targetReceiverIds = receiverIds.filter((id: string) => id && id !== actor.user.id);
    }
    // Single receiver
    else if (receiverId) {
      targetReceiverIds = [receiverId];
    }
    // Replies target the opposite participant in the thread by default.
    else if (parentId) {
      const parentMessage = await prisma.message.findUnique({
        where: { id: parentId },
        select: { senderId: true, receiverId: true },
      });
      if (parentMessage) {
        const other =
          parentMessage.senderId === actor.user.id
            ? parentMessage.receiverId
            : parentMessage.senderId;
        if (other) targetReceiverIds = [other];
      }
    }
    // New threads: default to a sensible counterpart based on selected role.
    if (targetReceiverIds.length === 0) {
      const counterpart = await prisma.user.findFirst({
        where: actor.effectiveRole === "tenant"
          ? {
              id: { not: actor.user.id },
              role: { in: ["landlord", "admin"] },
            }
          : {
              id: { not: actor.user.id },
              OR: [
                { role: "tenant" },
                { tenant: { isNot: null } },
              ],
            },
        orderBy: { createdAt: "asc" },
      });
      if (counterpart) targetReceiverIds = [counterpart.id];
      else targetReceiverIds = [actor.user.id]; // fallback (self)
    }

    // Create one message per recipient (bulk send for PM → multiple tenants)
    const messages = await Promise.all(
      targetReceiverIds.map((receiverId) =>
        prisma.message.create({
          data: {
            senderId: actor.user.id,
            receiverId,
            subject: subject || null,
            body,
            propertyId: propertyId || null,
            parentId: parentId || null,
          },
          include: {
            sender: { select: { id: true, name: true } },
            receiver: { select: { id: true, name: true } },
            property: { select: { id: true, name: true } },
          },
        })
      )
    );

    return NextResponse.json(messages.length === 1 ? messages[0] : messages, { status: 201 });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
