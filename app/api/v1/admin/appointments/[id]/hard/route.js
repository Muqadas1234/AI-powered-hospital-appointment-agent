import { jsonResponse, verifyAdmin } from "../../../../../../../lib/api-helpers.js";
import { deleteGoogleCalendarEvent } from "../../../../../../../lib/calendar.js";
import { prisma } from "../../../../../../../lib/prisma.js";

export async function DELETE(req, { params }) {
  try {
    await verifyAdmin(req);
    const appointmentId = parseInt(params.id, 10);

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      return jsonResponse({ detail: "Appointment not found." }, 404);
    }

    // Free the slot
    const slot = await prisma.slot.findFirst({
      where: {
        provider_id: appointment.provider_id,
        date: appointment.date,
        time: appointment.time,
      },
    });
    if (slot) {
      await prisma.slot.update({
        where: { id: slot.id },
        data: { is_booked: false },
      });
    }

    const calendarEventId = (appointment.google_calendar_event_id || "").trim();
    let calendarNote = "calendar-not-linked";
    if (calendarEventId) {
      const [_, deleted] = await deleteGoogleCalendarEvent(calendarEventId);
      calendarNote = deleted ? "calendar-event-deleted" : "calendar-event-delete-failed";
    }

    // Delete logs and appointment
    await prisma.notificationLog.deleteMany({
      where: { appointment_id: appointmentId },
    });
    await prisma.appointment.delete({
      where: { id: appointmentId },
    });

    return jsonResponse({
      appointment_id: appointmentId,
      status: "deleted",
      detail: `Appointment deleted successfully (${calendarNote}).`,
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
