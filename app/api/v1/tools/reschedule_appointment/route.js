import { jsonResponse, toolHandler } from "../../../../../lib/api-helpers.js";
import { rescheduleAppointment } from "../../../../../lib/booking.js";
import { notifyAppointmentEvent } from "../../../../../lib/notification.js";

export async function POST(req) {
  return toolHandler(req, async (r) => {
    const body = await r.json();
    const { appointment_id, new_slot_id, idempotency_key } = body;

    if (!appointment_id || !new_slot_id) {
      return jsonResponse({ detail: "appointment_id and new_slot_id are required." }, 400);
    }

    try {
      const [appointment, calendarDetail, didReschedule] = await rescheduleAppointment(
        parseInt(appointment_id, 10),
        parseInt(new_slot_id, 10),
        idempotency_key || null
      );

      let notificationStatus = null;
      if (didReschedule) {
        notificationStatus = await notifyAppointmentEvent(appointment, "rescheduled");
      }

      let detail = "Appointment rescheduled successfully.";
      if (calendarDetail) {
        detail = `${detail} ${calendarDetail}`;
      }
      if (notificationStatus !== null) {
        detail = `${detail} | notifications=${JSON.stringify(notificationStatus)}`;
      }

      return jsonResponse({
        appointment_id: appointment.id,
        status: appointment.status,
        detail: detail,
      });
    } catch (error) {
      return jsonResponse({ detail: error.message }, 400);
    }
  });
}
