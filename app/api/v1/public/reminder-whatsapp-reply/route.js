import { prisma } from "../../../../../lib/prisma.js";
import { cancelAppointment } from "../../../../../lib/booking.js";

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

async function findUsersByPhone(rawPhone) {
  const target = normalizePhoneDigits(rawPhone);
  if (!target) return [];

  const allUsers = await prisma.user.findMany({
    where: { phone: { not: null } },
  });

  return allUsers.filter((u) => normalizePhoneDigits(u.phone) === target);
}

function xmlResponse(messageText) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>${messageText}</Message></Response>`;
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const fromPhone = formData.get("From") || "";
    const body = formData.get("Body") || "";

    const message = String(body).trim().toLowerCase();
    const users = await findUsersByPhone(fromPhone);

    if (users.length === 0) {
      return xmlResponse("We could not find your appointment record for this number.");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointment = await prisma.appointment.findFirst({
      where: {
        user_id: { in: users.map((u) => u.id) },
        status: "confirmed",
        reminder_sent_at: { not: null },
        patient_response: null,
        date: { gte: today },
      },
      orderBy: [
        { reminder_sent_at: "desc" },
        { date: "desc" },
        { time: "desc" },
        { id: "desc" },
      ],
    });

    if (!appointment) {
      return xmlResponse("No active reminder was found for your number.");
    }

    const now = new Date();

    if (new Set(["yes", "y", "confirm", "confirmed", "yes confirm"]).has(message)) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          patient_response: "confirmed",
          patient_responded_at: now,
          reminder_action_used_at: now,
        },
      });
      return xmlResponse("Thank you. Your appointment is confirmed.");
    }

    if (new Set(["no", "n", "cancel", "no cancel"]).has(message)) {
      await cancelAppointment(
        appointment.id,
        "Cancelled by patient through WhatsApp reply",
        "patient",
        "whatsapp_reply"
      );

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          patient_response: "cancelled",
          patient_responded_at: now,
          reminder_action_used_at: now,
        },
      });
      return xmlResponse("Your appointment has been cancelled.");
    }

    return xmlResponse("Please reply YES to confirm or NO to cancel your appointment.");
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return xmlResponse("Error processing your request. Please try again later.");
  }
}
