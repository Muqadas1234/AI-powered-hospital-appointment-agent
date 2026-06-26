import crypto from "crypto";
import { jsonResponse } from "../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../lib/prisma.js";
import { cancelAppointment } from "../../../../../lib/booking.js";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token") || "";
    const action = searchParams.get("action") || "";

    if (!token || token.length < 16) {
      return jsonResponse({ detail: "A valid token is required." }, 400);
    }

    const actionNormalized = action.trim().toLowerCase();
    if (actionNormalized !== "confirm" && actionNormalized !== "cancel") {
      return jsonResponse({ detail: "Action must be confirm or cancel." }, 400);
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date();

    const appointment = await prisma.appointment.findFirst({
      where: { reminder_action_token_hash: tokenHash },
    });

    if (!appointment) {
      return jsonResponse({ detail: "This reminder link is invalid or expired." }, 404);
    }

    if (appointment.reminder_action_used_at !== null) {
      return jsonResponse({
        appointment_id: appointment.id,
        status: appointment.status,
        detail: "This reminder link was already used.",
      });
    }

    if (appointment.reminder_action_expires_at && appointment.reminder_action_expires_at < now) {
      return jsonResponse({ detail: "This reminder link has expired." }, 400);
    }

    if (actionNormalized === "confirm") {
      const updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          patient_response: "confirmed",
          patient_responded_at: now,
          reminder_action_used_at: now,
        },
      });

      return jsonResponse({
        appointment_id: updated.id,
        status: updated.status,
        detail: "Appointment confirmed by patient.",
      });
    }

    // Handle cancel action
    if (appointment.status !== "confirmed") {
      const updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          reminder_action_used_at: now,
        },
      });

      return jsonResponse({
        appointment_id: updated.id,
        status: updated.status,
        detail: "Appointment is no longer active for cancellation.",
      });
    }

    const cancelledAppt = await cancelAppointment(
      appointment.id,
      "Cancelled by patient through reminder link",
      "patient",
      "reminder_link"
    );

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        patient_response: "cancelled",
        patient_responded_at: now,
        reminder_action_used_at: now,
      },
    });

    return jsonResponse({
      appointment_id: updated.id,
      status: updated.status,
      detail: "Appointment cancelled by patient.",
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, 500);
  }
}
