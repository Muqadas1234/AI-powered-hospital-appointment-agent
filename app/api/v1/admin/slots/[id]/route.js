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

export async function PUT(req, { params }) {
  try {
    await verifyAdmin(req);
    const slotId = parseInt(params.id, 10);
    const body = await req.json();

    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
    });
    if (!slot) {
      return jsonResponse({ detail: "Slot not found." }, 404);
    }
    if (slot.is_booked) {
      return jsonResponse({ detail: "Cannot edit a booked slot." }, 400);
    }

    const provider = await prisma.provider.findUnique({
      where: { id: slot.provider_id },
    });
    if (!provider || !provider.is_active) {
      return jsonResponse({ detail: "Provider missing or archived." }, 400);
    }

    const newDate = body.date ? new Date(body.date + "T00:00:00Z") : slot.date;
    const newTime = body.time ? new Date("1970-01-01T" + body.time + "Z") : slot.time;
    let newEndTime = slot.end_time;
    if (body.end_time) {
      newEndTime = new Date("1970-01-01T" + body.end_time + "Z");
    } else if (body.time) {
      newEndTime = new Date(newTime.getTime() + 30 * 60 * 1000);
    }

    if (newEndTime.getTime() <= newTime.getTime()) {
      return jsonResponse({ detail: "end_time must be later than start time." }, 400);
    }

    // Check duplicate
    if (newDate.getTime() !== slot.date.getTime() || newTime.getTime() !== slot.time.getTime()) {
      const duplicate = await prisma.slot.findFirst({
        where: {
          provider_id: slot.provider_id,
          date: newDate,
          time: newTime,
          id: { not: slotId },
        },
      });
      if (duplicate) {
        return jsonResponse({ detail: "Another slot already exists for this provider/date/time." }, 400);
      }
    }

    // Check overlap
    const sameDay = await prisma.slot.findMany({
      where: {
        provider_id: slot.provider_id,
        date: newDate,
        id: { not: slotId },
      },
    });

    const startA = newTime.getTime();
    const endA = newEndTime.getTime();

    for (const s of sameDay) {
      const startB = new Date(s.time).getTime();
      const endB = s.end_time ? new Date(s.end_time).getTime() : startB + 30 * 60 * 1000;
      if (startA < endB && startB < endA) {
        return jsonResponse({ detail: "Slot time overlaps with an existing slot." }, 400);
      }
    }

    const updatedSlot = await prisma.slot.update({
      where: { id: slotId },
      data: {
        date: newDate,
        time: newTime,
        end_time: newEndTime,
      },
    });

    return jsonResponse({
      id: updatedSlot.id,
      provider_id: updatedSlot.provider_id,
      date: updatedSlot.date.toISOString().slice(0, 10),
      time: dbTimeToStr(updatedSlot.time),
      end_time: dbTimeToStr(updatedSlot.end_time),
      is_booked: updatedSlot.is_booked,
      created_by: updatedSlot.created_by,
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}

export async function DELETE(req, { params }) {
  try {
    await verifyAdmin(req);
    const slotId = parseInt(params.id, 10);

    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
    });
    if (!slot) {
      return jsonResponse({ detail: "Slot not found." }, 404);
    }
    if (slot.is_booked) {
      return jsonResponse({ detail: "Cannot delete booked slot." }, 400);
    }

    await prisma.slot.delete({
      where: { id: slotId },
    });

    return jsonResponse({
      appointment_id: 0,
      status: "deleted",
      detail: "Slot deleted successfully.",
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
