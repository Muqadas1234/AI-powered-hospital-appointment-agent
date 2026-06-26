import { jsonResponse, toolHandler } from "../../../../../lib/api-helpers.js";
import { bookAppointment, addToCalendar } from "../../../../../lib/booking.js";
import { notifyAppointmentEvent, formatTimeAmPm, formatDateForMessage } from "../../../../../lib/notification.js";
import { prisma } from "../../../../../lib/prisma.js";

function dbTimeToStr(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export async function POST(req) {
  return toolHandler(req, async (r) => {
    const body = await r.json();
    const {
      user_name,
      user_phone,
      provider_id,
      slot_id,
      confirmed_by_user,
      confirmation_text,
      idempotency_key,
    } = body;

    if (!confirmed_by_user) {
      return jsonResponse({
        detail: "Booking blocked: patient confirmation is required. Read back Name, Doctor, Date, Time and ask explicit yes before booking."
      }, 400);
    }

    const confText = (confirmation_text || "").trim().toLowerCase();
    const validConfPhrases = new Set([
      "yes",
      "yes confirm",
      "confirm",
      "confirmed",
      "ok confirm",
      "book it",
      "proceed",
    ]);

    if (confText && !validConfPhrases.has(confText)) {
      return jsonResponse({
        detail: "Booking blocked: confirmation_text must be an explicit confirmation phrase."
      }, 400);
    }

    try {
      const appointment = await bookAppointment(
        user_name,
        user_phone,
        parseInt(provider_id, 10),
        parseInt(slot_id, 10),
        idempotency_key || null
      );

      // Fetch slot for end_time formatting
      const slot = await prisma.slot.findUnique({
        where: { id: parseInt(slot_id, 10) },
      });

      const calendarStatus = await addToCalendar(appointment);
      const notificationStatus = await notifyAppointmentEvent(appointment, "booked");

      const spokenDate = formatDateForMessage(appointment.date);
      const spokenTime = formatTimeAmPm(appointment.time);
      const spokenEndTime = slot ? formatTimeAmPm(slot.end_time) : null;
      const spokenTimeRange = slot && slot.end_time
        ? `${spokenTime} to ${spokenEndTime}`
        : spokenTime;

      return jsonResponse({
        appointment_id: appointment.id,
        provider_name: appointment.provider ? appointment.provider.name : "Provider",
        date: appointment.date.toISOString().slice(0, 10),
        time: dbTimeToStr(appointment.time),
        end_time: slot ? dbTimeToStr(slot.end_time) : null,
        spoken_date: spokenDate,
        spoken_time: spokenTime,
        spoken_end_time: spokenEndTime,
        spoken_time_range: spokenTimeRange,
        status: appointment.status,
        calendar_status: `${calendarStatus} | notifications=${JSON.stringify(notificationStatus)}`,
      });
    } catch (error) {
      return jsonResponse({ detail: error.message }, 400);
    }
  });
}
