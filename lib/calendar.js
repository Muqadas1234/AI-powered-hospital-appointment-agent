import fs from "fs";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getCalendarClient() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || "";

  let auth;
  if (serviceAccountJson) {
    try {
      const credentials = JSON.parse(serviceAccountJson);
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES,
      });
    } catch (e) {
      console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON", e);
      return null;
    }
  } else if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    auth = new google.auth.GoogleAuth({
      keyFile: serviceAccountPath,
      scopes: SCOPES,
    });
  } else {
    return null;
  }

  return google.calendar({ version: "v3", auth });
}

export async function createGoogleCalendarEvent({
  summary,
  description,
  startDatetime,
  durationMinutes = 30,
  endDatetime = null,
}) {
  const calendarId = (process.env.GOOGLE_CALENDAR_ID || "primary").trim();
  const timezoneName = (process.env.APP_TIMEZONE || "Asia/Karachi").trim();

  const calendar = getCalendarClient();
  if (!calendar) {
    return ["Calendar sync skipped: service account file not configured.", null];
  }

  try {
    const start = new Date(startDatetime);
    let end;
    if (endDatetime) {
      end = new Date(endDatetime);
    } else {
      end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    }

    const event = {
      summary,
      description,
      start: {
        dateTime: start.toISOString().replace("Z", ""),
        timeZone: timezoneName,
      },
      end: {
        dateTime: end.toISOString().replace("Z", ""),
        timeZone: timezoneName,
      },
    };

    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    const eventId = response.data.id || "unknown";
    return [`Calendar event created successfully (event_id=${eventId}).`, eventId];
  } catch (error) {
    return [`Calendar sync failed: ${error.message}`, null];
  }
}

export async function deleteGoogleCalendarEvent(eventId) {
  const calendarId = (process.env.GOOGLE_CALENDAR_ID || "primary").trim();
  if (!eventId || !eventId.trim()) {
    return ["Calendar delete skipped: no event id.", true];
  }

  const calendar = getCalendarClient();
  if (!calendar) {
    return ["Calendar delete skipped: service account file not configured.", false];
  }

  try {
    await calendar.events.delete({
      calendarId,
      eventId: eventId.trim(),
    });
    return [`Calendar event removed (event_id=${eventId}).`, true];
  } catch (error) {
    if (error.code === 404 || (error.response && error.response.status === 404)) {
      return ["Calendar event already removed or not found.", true];
    }
    return [`Calendar delete failed: ${error.message}`, false];
  }
}
