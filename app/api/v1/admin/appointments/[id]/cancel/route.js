import { jsonResponse, verifyAdmin } from "../../../../../../../lib/api-helpers.js";
import { cancelAppointment } from "../../../../../../../lib/booking.js";
import { notifyAppointmentEvent } from "../../../../../../../lib/notification.js";
import { prisma } from "../../../../../../../lib/prisma.js";

export async function POST(req, { params }) {
  try {
    await verifyAdmin(req);
    const appointmentId = parseInt(params.id, 10);
    const body = await req.json();

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      return jsonResponse({ detail: "Appointment not found." }, 404);
    }
    if (appointment.status !== "confirmed") {
      return jsonResponse(
        { detail: "Only confirmed appointments can be cancelled. Use delete only if you must remove a record." },
        400
      );
    }

    const reason = (body.reason || "").trim() || "Cancelled by clinic (admin).";

    const cancelledAppt = await cancelAppointment(
      appointmentId,
      reason,
      "admin",
      "admin_panel"
    );

    const notificationStatus = await notifyAppointmentEvent(cancelledAppt, "cancelled");

    return jsonResponse({
      appointment_id: cancelledAppt.id,
      status: cancelledAppt.status,
      detail: `Appointment cancelled. Calendar updated. Notifications: ${JSON.stringify(notificationStatus)}`,
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
