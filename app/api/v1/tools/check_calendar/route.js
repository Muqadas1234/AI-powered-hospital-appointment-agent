import { jsonResponse, toolHandler } from "../../../../../lib/api-helpers.js";
import { checkCalendarConflict } from "../../../../../lib/booking.js";

export async function POST(req) {
  return toolHandler(req, async (r) => {
    const body = await r.json();
    const { user_phone, date, time } = body;

    if (!user_phone || !date || !time) {
      return jsonResponse({ detail: "user_phone, date, and time are required." }, 400);
    }

    // Ensure date is formatted properly, e.g. YYYY-MM-DD
    const dateStr = String(date).trim();
    
    // Ensure time is formatted as ISO 1970-01-01T[time]Z for Prisma compatibility
    let timeStr = String(time).trim();
    if (!timeStr.includes("T")) {
      // Append seconds if they are missing
      if (timeStr.split(":").length === 2) {
        timeStr += ":00";
      }
      timeStr = `1970-01-01T${timeStr}Z`;
    }

    const hasConflict = await checkCalendarConflict(user_phone, dateStr, timeStr);

    if (hasConflict) {
      return jsonResponse({
        has_conflict: true,
        detail: "You already have an appointment at this time.",
      });
    }

    return jsonResponse({
      has_conflict: false,
      detail: "No conflict found.",
    });
  });
}
