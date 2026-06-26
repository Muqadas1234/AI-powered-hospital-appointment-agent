import { jsonResponse, toolHandler } from "../../../../../lib/api-helpers.js";
import { findServiceAvailability } from "../../../../../lib/booking.js";
import { formatTimeAmPm, formatDateForMessage } from "../../../../../lib/notification.js";

function dbTimeToStr(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function toOption(slot) {
  if (!slot) return null;
  const providerName = slot.provider ? slot.provider.name : "Provider";
  return {
    provider_id: slot.provider_id,
    provider_name: providerName,
    date: slot.date.toISOString().slice(0, 10),
    time: dbTimeToStr(slot.time),
    end_time: dbTimeToStr(slot.end_time),
    spoken_date: formatDateForMessage(slot.date),
    spoken_time: formatTimeAmPm(slot.time),
    spoken_end_time: formatTimeAmPm(slot.end_time),
    spoken_time_range: slot.end_time ? `${formatTimeAmPm(slot.time)} to ${formatTimeAmPm(slot.end_time)}` : formatTimeAmPm(slot.time),
    slot_id: slot.id,
  };
}

export async function POST(req) {
  return toolHandler(req, async (r) => {
    const body = await r.json();
    const { service, date, preferred_time, time_window, doctor_name } = body;

    if (!service || !date) {
      return jsonResponse({ detail: "service and date are required." }, 400);
    }

    const [isAvailable, detail, bestSlot, alternatives] = await findServiceAvailability(
      service,
      date,
      preferred_time || null,
      time_window || null,
      doctor_name || null
    );

    const alternativeOptions = (alternatives || [])
      .map(toOption)
      .filter((opt) => opt !== null);

    return jsonResponse({
      is_available: isAvailable,
      detail: detail,
      best_option: toOption(bestSlot),
      alternatives: alternativeOptions,
    });
  });
}
