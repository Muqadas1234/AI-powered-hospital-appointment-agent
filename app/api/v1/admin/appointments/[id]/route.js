import { jsonResponse, verifyAdmin } from "../../../../../../lib/api-helpers.js";
import { deleteGoogleCalendarEvent } from "../../../../../../lib/calendar.js";
import { notifyAppointmentEvent } from "../../../../../../lib/notification.js";
import { prisma } from "../../../../../../lib/prisma.js";

function dbTimeToStr(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export async function GET(req, { params }) {
  try {
    await verifyAdmin(req);
    const appointmentId = parseInt(params.id, 10);

    const item = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { user: true, provider: true },
    });

    if (!item) {
      return jsonResponse({ detail: "Appointment not found." }, 404);
    }

    const slot = await prisma.slot.findFirst({
      where: {
        provider_id: item.provider_id,
        date: item.date,
        time: item.time,
      },
    });

    const latestWa = await prisma.notificationLog.findFirst({
      where: {
        appointment_id: item.id,
        channel: "whatsapp",
        event_type: "reminder",
        status: "sent",
      },
      orderBy: { id: "desc" },
    });

    const result = {
      id: item.id,
      user_name: item.user.name,
      user_phone: item.user.phone,
      provider_name: item.provider.name,
      service: item.provider.service,
      date: item.date.toISOString().slice(0, 10),
      time: dbTimeToStr(item.time),
      end_time: slot ? dbTimeToStr(slot.end_time) : null,
      status: item.status,
      reminder_sent_at: item.reminder_sent_at ? item.reminder_sent_at.toISOString() : null,
      reminder_whatsapp_sent_at: latestWa ? latestWa.created_at.toISOString() : null,
      patient_response: item.patient_response,
      patient_responded_at: item.patient_responded_at ? item.patient_responded_at.toISOString() : null,
      cancelled_by: item.cancelled_by,
      cancelled_via: item.cancelled_via,
      cancellation_reason: item.cancellation_reason,
    };

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}

export async function PATCH(req, { params }) {
  try {
    await verifyAdmin(req);
    const appointmentId = parseInt(params.id, 10);
    const body = await req.json();

    if (!body.status) {
      return jsonResponse({ detail: "status is required." }, 400);
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { user: true, provider: true },
    });

    if (!appointment) {
      return jsonResponse({ detail: "Appointment not found." }, 404);
    }

    const nextStatus = body.status.trim().toLowerCase();

    const updateData = { status: nextStatus };
    if (nextStatus === "cancelled") {
      updateData.cancelled_by = "admin";
      updateData.cancelled_via = "admin_panel";
      if (!appointment.cancellation_reason || !appointment.cancellation_reason.trim()) {
        updateData.cancellation_reason = "cancelled by admin from dashboard";
      }
    } else if (nextStatus === "confirmed") {
      updateData.cancelled_by = null;
      updateData.cancelled_via = null;
      updateData.cancellation_reason = null;
    }

    const updatedAppt = await prisma.appointment.update({
      where: { id: appointmentId },
      data: updateData,
      include: { user: true, provider: true },
    });

    if (nextStatus === "cancelled" || nextStatus === "confirmed") {
      const eventType = nextStatus === "cancelled" ? "cancelled" : "booked";
      await notifyAppointmentEvent(updatedAppt, eventType);
    }

    return jsonResponse({
      appointment_id: updatedAppt.id,
      status: updatedAppt.status,
      detail: "Appointment status updated successfully.",
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
