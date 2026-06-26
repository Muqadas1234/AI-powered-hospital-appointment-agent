import { jsonResponse, verifyAdmin } from "../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../lib/prisma.js";

// Helper to convert DB Date objects to time strings (e.g. 1970-01-01T10:00:00.000Z -> "10:00:00")
function dbTimeToStr(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export async function GET(req) {
  try {
    await verifyAdmin(req);
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("provider_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    const where = {};
    if (providerId) where.provider_id = parseInt(providerId, 10);
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom + "T00:00:00Z");
      if (dateTo) where.date.lte = new Date(dateTo + "T23:59:59Z");
    }

    const slots = await prisma.slot.findMany({
      where,
      orderBy: [
        { date: "asc" },
        { time: "asc" },
      ],
    });

    const result = slots.map((s) => ({
      id: s.id,
      provider_id: s.provider_id,
      date: s.date.toISOString().slice(0, 10),
      time: dbTimeToStr(s.time),
      end_time: dbTimeToStr(s.end_time),
      is_booked: s.is_booked,
      created_by: s.created_by,
    }));

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}

export async function POST(req) {
  try {
    const admin = await verifyAdmin(req);
    const body = await req.json();

    const providerId = parseInt(body.provider_id, 10);
    if (!providerId || !body.date || !body.time) {
      return jsonResponse({ detail: "provider_id, date, and time are required." }, 400);
    }

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      return jsonResponse({ detail: "Provider not found." }, 400);
    }
    if (!provider.is_active) {
      return jsonResponse({ detail: "Cannot create slot for archived provider." }, 400);
    }

    const slotDate = new Date(body.date + "T00:00:00Z");
    const slotTime = new Date("1970-01-01T" + body.time + "Z");
    const slotEndTime = body.end_time
      ? new Date("1970-01-01T" + body.end_time + "Z")
      : new Date(slotTime.getTime() + 30 * 60 * 1000);

    if (slotEndTime.getTime() <= slotTime.getTime()) {
      return jsonResponse({ detail: "end_time must be later than start time." }, 400);
    }

    // Check duplicate
    const duplicate = await prisma.slot.findFirst({
      where: {
        provider_id: providerId,
        date: slotDate,
        time: slotTime,
      },
    });
    if (duplicate) {
      return jsonResponse({ detail: "Slot already exists for provider/date/time." }, 400);
    }

    // Check overlaps
    const sameDaySlots = await prisma.slot.findMany({
      where: {
        provider_id: providerId,
        date: slotDate,
      },
    });

    const startA = slotTime.getTime();
    const endA = slotEndTime.getTime();

    for (const s of sameDaySlots) {
      const startB = new Date(s.time).getTime();
      const endB = s.end_time ? new Date(s.end_time).getTime() : startB + 30 * 60 * 1000;
      if (startA < endB && startB < endA) {
        return jsonResponse({ detail: "Slot time overlaps with an existing slot." }, 400);
      }
    }

    const slot = await prisma.slot.create({
      data: {
        provider_id: providerId,
        date: slotDate,
        time: slotTime,
        end_time: slotEndTime,
        is_booked: false,
        created_by: admin.username,
      },
    });

    return jsonResponse({
      id: slot.id,
      provider_id: slot.provider_id,
      date: slot.date.toISOString().slice(0, 10),
      time: dbTimeToStr(slot.time),
      end_time: dbTimeToStr(slot.end_time),
      is_booked: slot.is_booked,
      created_by: slot.created_by,
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
