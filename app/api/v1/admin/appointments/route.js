import { jsonResponse, verifyAdmin } from "../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../lib/prisma.js";

function dbTimeToStr(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export async function GET(req) {
  try {
    await verifyAdmin(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const userPhone = searchParams.get("user_phone");
    const providerId = searchParams.get("provider_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const where = {};
    if (status) where.status = status;
    if (providerId) where.provider_id = parseInt(providerId, 10);
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom + "T00:00:00Z");
      if (dateTo) where.date.lte = new Date(dateTo + "T23:59:59Z");
    }
    if (userPhone) {
      where.user = {
        phone: {
          contains: userPhone.trim(),
          mode: "insensitive",
        },
      };
    }

    const total = await prisma.appointment.count({ where });
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        user: true,
        provider: true,
      },
      orderBy: [
        { date: "desc" },
        { time: "desc" },
      ],
      take: limit,
      skip: offset,
    });

    const items = await Promise.all(
      appointments.map(async (item) => {
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

        return {
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
      })
    );

    return jsonResponse({ total, items });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
