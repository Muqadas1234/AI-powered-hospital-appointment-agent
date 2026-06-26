import { jsonResponse, toolHandler } from "../../../../../lib/api-helpers.js";
import { getAvailableSlots } from "../../../../../lib/booking.js";
import { formatTimeAmPm, formatDateForMessage } from "../../../../../lib/notification.js";

function dbTimeToStr(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

async function handleGetSlots(providerId) {
  if (!providerId) return jsonResponse([]);
  const slots = await getAvailableSlots(parseInt(providerId, 10));
  const result = slots.map((s) => ({
    id: s.id,
    provider_id: s.provider_id,
    date: s.date.toISOString().slice(0, 10),
    time: dbTimeToStr(s.time),
    end_time: dbTimeToStr(s.end_time),
    spoken_date: formatDateForMessage(s.date),
    spoken_time: formatTimeAmPm(s.time),
    spoken_end_time: formatTimeAmPm(s.end_time),
    spoken_time_range: s.end_time ? `${formatTimeAmPm(s.time)} to ${formatTimeAmPm(s.end_time)}` : formatTimeAmPm(s.time),
    is_booked: s.is_booked,
  }));
  return jsonResponse(result);
}

export async function GET(req) {
  return toolHandler(req, async (r) => {
    const { searchParams } = new URL(r.url);
    const providerId = searchParams.get("provider_id");
    return handleGetSlots(providerId);
  });
}

export async function POST(req) {
  return toolHandler(req, async (r) => {
    let providerId = null;
    try {
      const body = await r.json();
      providerId = body.provider_id;
    } catch (e) {
      // Body may be empty
    }
    return handleGetSlots(providerId);
  });
}
