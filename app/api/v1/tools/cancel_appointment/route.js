import { jsonResponse, toolHandler } from "../../../../../lib/api-helpers.js";
import { cancelAppointment } from "../../../../../lib/booking.js";
import { notifyAppointmentEvent } from "../../../../../lib/notification.js";

export async function POST(req) {
  return toolHandler(req, async (r) => {
    const body = await r.json();
    const { appointment_id, reason } = body;

    if (!appointment_id) {
      return jsonResponse({ detail: "appointment_id is required." }, 400);
    }

    try {
      const appointment = await cancelAppointment(
        parseInt(appointment_id, 10),
        reason || "cancelled by patient through bot",
        "patient",
        "bot"
      );

      await notifyAppointmentEvent(appointment, "cancelled");

      const cancellationReason = appointment.cancellation_reason || reason || "cancelled by patient through bot";

      return jsonResponse({
        appointment_id: appointment.id,
        status: appointment.status,
        detail: `Appointment cancelled successfully. Reason: ${cancellationReason}`,
      });
    } catch (error) {
      return jsonResponse({ detail: error.message }, 400);
    }
  });
}
