import twilio from "twilio";
import { prisma } from "./prisma.js";

export function normalizePhoneE164(phone) {
  let value = (phone || "").trim();
  if (!value) return "";

  let cleaned = value.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.length === 11 && digits.startsWith("03")) {
    return `+92${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith("3")) {
    return `+92${digits}`;
  }
  if (digits.length >= 10) {
    return `+${digits}`;
  }
  return "";
}

export function normalizeWhatsappFrom(phone) {
  const raw = (phone || "").trim();
  if (!raw) return "";
  if (raw.toLowerCase().startsWith("whatsapp:")) {
    return raw;
  }
  const normalized = normalizePhoneE164(raw);
  if (!normalized) return "";
  return `whatsapp:${normalized}`;
}

export function formatTimeAmPm(timeVal) {
  if (!timeVal) return "";
  if (timeVal instanceof Date) {
    const display = timeVal.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC", // The database time is already local time; don't apply an offset
    });
    return display.replace(/^0/, "");
  }
  // Otherwise, handle time strings like "10:00:00"
  const match = String(timeVal).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(timeVal);
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${suffix}`;
}

export function formatDateForMessage(dateVal) {
  const d = new Date(dateVal);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: process.env.APP_TIMEZONE || "Asia/Karachi",
  });
}

export async function logNotification({
  appointmentId,
  channel,
  recipient,
  message,
  status,
  error = null,
  eventType = null,
}) {
  return prisma.notificationLog.create({
    data: {
      appointment_id: appointmentId,
      channel,
      recipient,
      message,
      status,
      error,
      event_type: eventType,
    },
  });
}

export function buildAppointmentMessage(appointment, eventType, extraLines = []) {
  const startS = formatTimeAmPm(appointment.time);
  const endS = appointment.end_time ? formatTimeAmPm(appointment.end_time) : "";
  const timeLine = endS ? `${startS} to ${endS}` : startS;
  const serviceLine = (appointment.provider?.service || "").trim() || "—";
  const patientName = (appointment.user?.name || "").trim() || "Patient";

  const eventMap = {
    booked: "Your appointment has been confirmed.",
    cancelled: "Your appointment has been cancelled.",
    rescheduled: "Your appointment has been rescheduled.",
    reminder: "This is a reminder for your upcoming appointment.",
  };
  let base = eventMap[eventType] || "Your appointment has been updated.";

  if (eventType === "cancelled") {
    const via = (appointment.cancelled_via || "").toLowerCase();
    const by = (appointment.cancelled_by || "").toLowerCase();
    if (via === "admin_panel" || by === "admin") {
      const reasonText = (appointment.cancellation_reason || "").trim();
      base = "Your appointment has been cancelled by the hospital/clinic.";
      if (reasonText) {
        base = `${base} Reason: ${reasonText}.`;
      }
    }
  }

  if (eventType === "reminder") {
    const details = [
      "Appointment Reminder",
      `Doctor: ${appointment.provider?.name}`,
      `Service: ${serviceLine}`,
      `Date: ${formatDateForMessage(appointment.date)}`,
      `Time: ${timeLine}`,
      "Please arrive on time for your appointment.",
    ];
    if (extraLines.length > 0) {
      details.push(...extraLines.filter(Boolean).map((l) => l.trim()));
    }
    return details.join("\n");
  }

  let extraBlock = "";
  if (extraLines.length > 0) {
    const rendered = extraLines.filter(Boolean).map((l) => l.trim());
    if (rendered.length > 0) {
      extraBlock = "\n\n" + rendered.join("\n");
    }
  }

  return (
    `Dear ${patientName},\n` +
    `${base}\n\n` +
    `Appointment Details:\n` +
    `- Doctor: ${appointment.provider?.name}\n` +
    `- Service: ${serviceLine}\n` +
    `- Date: ${formatDateForMessage(appointment.date)}\n` +
    `- Time: ${timeLine}\n` +
    `- Appointment ID: ${appointment.id}\n` +
    `- Status: ${appointment.status}` +
    `${extraBlock}\n\n` +
    `Need to reschedule or cancel? Please contact reception/assistant helpline.\n` +
    `CareVoice Hospital Appointments Team`
  );
}

export async function sendSmsNotification(appointment, message, eventType) {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const fromPhone = normalizePhoneE164(process.env.TWILIO_FROM_PHONE || "");
  const toPhone = normalizePhoneE164(appointment.user?.phone);

  if (!accountSid || !authToken || !fromPhone || !toPhone) {
    await logNotification({
      appointmentId: appointment.id,
      channel: "sms",
      recipient: toPhone || "unknown",
      message,
      status: "skipped",
      error: "Twilio or user phone not configured.",
      eventType,
    });
    return "SMS skipped (Twilio or phone not configured).";
  }

  const client = twilio(accountSid, authToken);
  try {
    await client.messages.create({
      body: message,
      from: fromPhone,
      to: toPhone,
    });
    await logNotification({
      appointmentId: appointment.id,
      channel: "sms",
      recipient: toPhone,
      message,
      status: "sent",
      eventType,
    });
    return "SMS sent.";
  } catch (error) {
    await logNotification({
      appointmentId: appointment.id,
      channel: "sms",
      recipient: toPhone,
      message,
      status: "failed",
      error: error.message,
      eventType,
    });
    return `SMS failed: ${error.message}`;
  }
}

export async function sendWhatsappNotification(appointment, message, eventType) {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const fromWa = normalizeWhatsappFrom(process.env.TWILIO_WHATSAPP_FROM || "");
  const toPhone = normalizePhoneE164(appointment.user?.phone);
  const toWa = toPhone ? `whatsapp:${toPhone}` : "";

  if (!accountSid || !authToken || !fromWa || !toWa) {
    await logNotification({
      appointmentId: appointment.id,
      channel: "whatsapp",
      recipient: toWa || "unknown",
      message,
      status: "skipped",
      error: "Twilio WhatsApp or user phone not configured.",
      eventType,
    });
    return "WhatsApp skipped (Twilio WhatsApp or phone not configured).";
  }

  const client = twilio(accountSid, authToken);
  try {
    await client.messages.create({
      body: message,
      from: fromWa,
      to: toWa,
    });
    await logNotification({
      appointmentId: appointment.id,
      channel: "whatsapp",
      recipient: toWa,
      message,
      status: "sent",
      eventType,
    });
    return "WhatsApp sent.";
  } catch (error) {
    await logNotification({
      appointmentId: appointment.id,
      channel: "whatsapp",
      recipient: toWa,
      message,
      status: "failed",
      error: error.message,
      eventType,
    });
    return `WhatsApp failed: ${error.message}`;
  }
}

export async function notifyAppointmentEvent(appointment, eventType, extraLines = []) {
  let appt = appointment;
  if (!appt.user || !appt.provider) {
    appt = await prisma.appointment.findUnique({
      where: { id: appointment.id },
      include: { user: true, provider: true },
    });
  }

  const slot = await prisma.slot.findFirst({
    where: {
      provider_id: appt.provider_id,
      date: appt.date,
      time: appt.time,
    },
  });
  if (slot) {
    appt.end_time = slot.end_time;
  }

  const message = buildAppointmentMessage(appt, eventType, extraLines);
  const waEnabled = (process.env.WHATSAPP_REMINDER_ENABLED || "true").trim().toLowerCase() !== "false";
  const smsEnabled = (process.env.SMS_REMINDER_ENABLED || "true").trim().toLowerCase() !== "false";

  const results = {};
  if (waEnabled) {
    results.whatsapp = await sendWhatsappNotification(appt, message, eventType);
  }
  if (smsEnabled) {
    results.sms = await sendSmsNotification(appt, message, eventType);
  }
  return results;
}

export async function runDueReminders() {
  const smsLeadMinutes = Math.max(1, parseInt(process.env.REMINDER_SMS_LEAD_MINUTES || "1440", 10));
  const whatsappLeadMinutes = Math.max(1, parseInt(process.env.REMINDER_WHATSAPP_LEAD_MINUTES || "1440", 10));
  const waEnabled = (process.env.WHATSAPP_REMINDER_ENABLED || "true").trim().toLowerCase() !== "false";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: "confirmed",
      date: { gte: today },
    },
    include: { user: true, provider: true },
  });

  const now = new Date();
  let sentCount = 0;

  for (const appt of appointments) {
    try {
      const apptDate = new Date(appt.date);
      const apptTime = new Date(appt.time);
      const apptDt = new Date(
        apptDate.getFullYear(),
        apptDate.getMonth(),
        apptDate.getDate(),
        apptTime.getHours(),
        apptTime.getMinutes(),
        apptTime.getSeconds()
      );

      if (apptDt <= now) continue;

      const smsReminderAt = new Date(apptDt.getTime() - smsLeadMinutes * 60 * 1000);
      const whatsappReminderAt = new Date(apptDt.getTime() - whatsappLeadMinutes * 60 * 1000);

      const response = (appt.patient_response || "").trim().toLowerCase();
      const hasResponse = ["confirmed", "cancelled"].includes(response);

      if (!hasResponse && !appt.reminder_sent_at && now >= smsReminderAt) {
        const slot = await prisma.slot.findFirst({
          where: { provider_id: appt.provider_id, date: appt.date, time: appt.time },
        });
        if (slot) {
          appt.end_time = slot.end_time;
        }
        const smsMessage = buildAppointmentMessage(appt, "reminder", [
          "This is your 24-hour appointment reminder.",
        ]);
        await sendSmsNotification(appt, smsMessage, "reminder");
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { reminder_sent_at: new Date() },
        });
        sentCount++;
        continue;
      }

      if (waEnabled && !hasResponse && appt.reminder_sent_at && now >= whatsappReminderAt) {
        const waAlreadySent = await prisma.notificationLog.findFirst({
          where: {
            appointment_id: appt.id,
            channel: "whatsapp",
            event_type: "reminder",
          },
        });
        if (waAlreadySent) continue;

        const slot = await prisma.slot.findFirst({
          where: { provider_id: appt.provider_id, date: appt.date, time: appt.time },
        });
        if (slot) {
          appt.end_time = slot.end_time;
        }
        const whatsappMessage = buildAppointmentMessage(appt, "reminder", [
          "Second reminder via WhatsApp.",
          "Reply YES to confirm or NO to cancel your appointment.",
        ]);
        await sendWhatsappNotification(appt, whatsappMessage, "reminder");
        sentCount++;
      }
    } catch (err) {
      console.error(`Failed to send reminder for appointment ${appt.id}:`, err);
    }
  }

  return sentCount;
}

export async function retryFailedNotifications() {
  const maxAttempts = Math.max(1, parseInt(process.env.NOTIFICATION_RETRY_MAX_ATTEMPTS || "2", 10));
  const batchSize = Math.max(1, parseInt(process.env.NOTIFICATION_RETRY_BATCH_SIZE || "20", 10));
  const retryDelayMinutes = Math.max(1, parseInt(process.env.NOTIFICATION_RETRY_DELAY_MINUTES || "2", 10));
  const retryBackoffMultiplier = Math.max(
    1.0,
    parseFloat(process.env.NOTIFICATION_RETRY_BACKOFF_MULTIPLIER || "1.5")
  );

  const now = new Date();

  const failedLogs = await prisma.notificationLog.findMany({
    where: { status: "failed" },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    take: batchSize,
  });

  let retriedCount = 0;

  for (const log of failedLogs) {
    try {
      const failedAttempts = await prisma.notificationLog.count({
        where: {
          appointment_id: log.appointment_id,
          channel: log.channel,
          event_type: log.event_type,
          recipient: log.recipient,
          status: "failed",
        },
      });

      if (failedAttempts >= maxAttempts) continue;

      const latestFailedLog = await prisma.notificationLog.findFirst({
        where: {
          appointment_id: log.appointment_id,
          channel: log.channel,
          event_type: log.event_type,
          recipient: log.recipient,
          status: "failed",
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });

      if (latestFailedLog) {
        const waitFactor = Math.pow(retryBackoffMultiplier, Math.max(0, failedAttempts - 1));
        const waitMs = retryDelayMinutes * waitFactor * 60 * 1000;
        const readyAt = new Date(latestFailedLog.created_at.getTime() + waitMs);
        if (readyAt > now) continue;
      }

      const appointment = await prisma.appointment.findUnique({
        where: { id: log.appointment_id },
        include: { user: true, provider: true },
      });

      if (!appointment) {
        await logNotification({
          appointmentId: log.appointment_id,
          channel: log.channel,
          recipient: log.recipient,
          message: log.message,
          status: "skipped",
          error: "Retry skipped: appointment not found.",
          eventType: log.event_type,
        });
        continue;
      }

      const eventType = log.event_type || "unknown";
      const message = log.message || buildAppointmentMessage(appointment, eventType);

      if (log.channel === "sms") {
        await sendSmsNotification(appointment, message, eventType);
        retriedCount++;
      } else if (log.channel === "whatsapp") {
        await sendWhatsappNotification(appointment, message, eventType);
        retriedCount++;
      }
    } catch (err) {
      console.error(`Failed to retry notification ${log.id}:`, err);
    }
  }

  return retriedCount;
}
