import { jsonResponse, verifyAdmin } from "../../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../../lib/prisma.js";

function dbTimeToStr(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export async function POST(req) {
  try {
    const admin = await verifyAdmin(req);
    const body = await req.json();

    const providerId = parseInt(body.provider_id, 10);
    const days = parseInt(body.days || "7", 10);
    const times = body.times || [];
    const durationMinutes = parseInt(body.duration_minutes || "30", 10);

    if (!providerId || !body.start_date || times.length === 0) {
      return jsonResponse({ detail: "provider_id, start_date, and times list are required." }, 400);
    }

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      return jsonResponse({ detail: "Provider not found." }, 400);
    }

    const createdRows = [];
    const startDate = new Date(body.start_date + "T00:00:00Z");

    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      const slotDate = new Date(startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);

      for (const timeStr of times) {
        const timeClean = timeStr.trim();
        if (!timeClean) continue;

        const timeParts = timeClean.split(":");
        if (timeParts.length < 2) continue;

        const hh = timeParts[0].padStart(2, "0");
        const mm = timeParts[1].padStart(2, "0");
        const ss = (timeParts[2] || "00").padStart(2, "0");

        const slotTime = new Date(`1970-01-01T${hh}:${mm}:${ss}Z`);
        const slotEndTime = new Date(slotTime.getTime() + durationMinutes * 60 * 1000);

        // Check if slot exists
        const exists = await prisma.slot.findFirst({
          where: {
            provider_id: providerId,
            date: slotDate,
            time: slotTime,
          },
        });
        if (exists) continue;

        // Check overlap
        const overlapRows = await prisma.slot.findMany({
          where: {
            provider_id: providerId,
            date: slotDate,
          },
        });

        const startA = slotTime.getTime();
        const endA = slotEndTime.getTime();
        let blocked = false;

        for (const s of overlapRows) {
          const startB = new Date(s.time).getTime();
          const endB = s.end_time ? new Date(s.end_time).getTime() : startB + 30 * 60 * 1000;
          if (startA < endB && startB < endA) {
            blocked = true;
            break;
          }
        }

        if (blocked) continue;

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
        createdRows.push(slot);
      }
    }

    const result = createdRows.map((s) => ({
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
