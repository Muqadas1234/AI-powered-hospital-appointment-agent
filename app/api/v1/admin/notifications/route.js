import { jsonResponse, verifyAdmin } from "../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../lib/prisma.js";

export async function GET(req) {
  try {
    await verifyAdmin(req);
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get("channel");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const where = {};
    if (channel) where.channel = channel;
    if (status) where.status = status;

    const total = await prisma.notificationLog.count({ where });
    const logs = await prisma.notificationLog.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
    });

    const items = logs.map((row) => ({
      id: row.id,
      appointment_id: row.appointment_id,
      channel: row.channel,
      recipient: row.recipient,
      status: row.status,
      error: row.error,
      event_type: row.event_type,
    }));

    return jsonResponse({ total, items });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
