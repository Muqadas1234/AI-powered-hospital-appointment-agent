import { createGoogleCalendarEvent, deleteGoogleCalendarEvent } from "./calendar.js";
import { prisma } from "./prisma.js";

// Levenshtein and fuzzy match helpers to replicate Python's difflib.get_close_matches
function levenshteinDistance(a, b) {
  const tmp = [];
  let i, j;
  for (i = 0; i <= a.length; i++) {
    tmp.push([i]);
  }
  for (j = 1; j <= b.length; j++) {
    tmp[0].push(j);
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

function getCloseMatches(word, possibilities, n = 3, cutoff = 0.6) {
  const matches = [];
  for (const pos of possibilities) {
    const distance = levenshteinDistance(word, pos);
    const maxLen = Math.max(word.length, pos.length);
    const similarity = 1 - distance / maxLen;
    if (similarity >= cutoff) {
      matches.push({ word: pos, similarity });
    }
  }
  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, n).map((m) => m.word);
}

function normalizePhoneKey(phone) {
  return (phone || "").replace(/\D/g, "");
}

// Parses time strings like "10:00 AM", "10:00:00", etc. into standard Date object for time (represented on 1970-01-01)
export function parsePreferredTime(value) {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;

  // Format: HH:MM or HH:MM:SS (24-hour)
  let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ss = parseInt(m[3] || "0", 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59) {
      return new Date(`1970-01-01T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}Z`);
    }
  }

  // Format: HH:MM AM/PM or HH AM/PM
  const sAmPm = s.toUpperCase().replace(/A\.M\./, "AM").replace(/P\.M\./, "PM").replace(/\s+/g, "");
  m = sAmPm.match(/^(\d{1,2})(?::(\d{2}))?(AM|PM)$/);
  if (m) {
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2] || "0", 10);
    const ap = m[3];
    if (ap === "PM" && hh !== 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return new Date(`1970-01-01T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
    }
  }

  return null;
}

export async function getProviders(service) {
  const raw = (service || "").trim().toLowerCase();
  const normalized = raw.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const activeProviders = await prisma.provider.findMany({
    where: { is_active: true },
    orderBy: { id: "asc" },
  });

  if (activeProviders.length === 0) return [];
  if (!normalized || ["all", "all services", "services", "service", "any"].includes(normalized)) {
    return activeProviders;
  }

  // Name hints for doctor lookup
  const nameHints = [
    ["aisha", "Aisha"],
    ["asiha", "Aisha"],
    ["ahmed raza", "Ahmed Raza"],
    ["ahmed khan", "Ahmed Khan"],
    ["sara iqbal", "Sara Iqbal"],
    ["sana ali", "Sana Ali"],
    ["amna", "Amna"],
  ];

  for (const [hint, likeName] of nameHints) {
    if (normalized.includes(hint)) {
      const named = await prisma.provider.findMany({
        where: {
          is_active: true,
          name: { contains: likeName, mode: "insensitive" },
        },
        orderBy: { id: "asc" },
      });
      if (named.length > 0) return named;
    }
  }

  // Match exact services
  const byExactService = activeProviders.filter(
    (p) => (p.service || "").trim().toLowerCase() === normalized
  );
  if (byExactService.length > 0) return byExactService;

  // Match contains services
  const byContainsService = activeProviders.filter(
    (p) =>
      normalized.includes((p.service || "").trim().toLowerCase()) ||
      (p.service || "").trim().toLowerCase().includes(normalized)
  );
  if (byContainsService.length > 0) return byContainsService;

  // Map spoken labels/aliases
  const ordered = [
    ["cardiology", ["cardiology", "cardiac", "heart", "cardio"]],
    ["orthopedics", ["orthopedics", "orthopedic", "ortho", "bone", "joint"]],
    ["neurology", ["neurology", "neuro", "brain", "nerve"]],
    ["dermatology", ["dermatology", "dermatologist", "skin consultation", "skin", "derm", "derma"]],
    ["dentistry", ["dentistry", "dental", "dentist", "teeth", "tooth", "cleaning"]],
    ["pediatrics", ["pediatrics", "pediatric", "child", "kids"]],
    ["gynecology", ["gynecology", "gynecologist", "gynae", "women", "obgyn"]],
    ["ent", ["ent", "ear nose throat"]],
  ];

  let mappedService = null;
  for (const [target, aliases] of ordered) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      mappedService = target;
      break;
    }
  }

  // Fuzzy matches using Levenshtein distance
  if (!mappedService && normalized) {
    const allAliases = [];
    const aliasPossibilities = [];
    for (const [target, aliases] of ordered) {
      for (const alias of aliases) {
        allAliases.push({ alias, target });
        aliasPossibilities.push(alias);
      }
    }
    const closest = getCloseMatches(normalized, aliasPossibilities, 1, 0.72);
    if (closest.length > 0) {
      const match = allAliases.find((item) => item.alias === closest[0]);
      if (match) mappedService = match.target;
    }
  }

  if (mappedService) {
    const providers = activeProviders.filter(
      (p) => (p.service || "").trim().toLowerCase() === mappedService
    );
    if (providers.length > 0) return providers;
  }

  return activeProviders;
}

export async function getAvailableSlots(providerId) {
  const activeProvider = await prisma.provider.findFirst({
    where: { id: providerId, is_active: true },
  });
  if (!activeProvider) return [];

  return prisma.slot.findMany({
    where: {
      provider_id: providerId,
      is_booked: false,
    },
    orderBy: [
      { date: "asc" },
      { time: "asc" },
    ],
  });
}

export async function checkCalendarConflict(userPhone, apptDate, apptTime, excludeAppointmentId = null) {
  const phoneDigits = normalizePhoneKey(userPhone);
  if (!phoneDigits) return false;

  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
  });

  let matchedUser = null;
  for (const item of users) {
    if (normalizePhoneKey(item.phone) === phoneDigits) {
      matchedUser = item;
      break;
    }
  }
  if (!matchedUser) return false;

  const dateSearch = new Date(apptDate);
  dateSearch.setHours(0, 0, 0, 0);

  const timeSearch = new Date(apptTime);

  const conflict = await prisma.appointment.findFirst({
    where: {
      user_id: matchedUser.id,
      date: dateSearch,
      time: timeSearch,
      status: "confirmed",
      id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
    },
  });

  return conflict !== null;
}

export async function bookAppointment(userName, userPhone, providerId, slotId, idempotencyKey = null) {
  const phoneValue = (userPhone || "").trim();
  if (!phoneValue) throw new Error("Phone number is required.");

  const phoneDigits = normalizePhoneKey(phoneValue);
  if (!phoneDigits) throw new Error("Invalid phone number.");

  if (idempotencyKey) {
    const existing = await prisma.appointment.findUnique({
      where: { request_id: idempotencyKey },
    });
    if (existing) return existing;
  }

  const provider = await prisma.provider.findFirst({
    where: { id: providerId, is_active: true },
  });
  if (!provider) throw new Error("Provider not found.");

  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
  });
  if (!slot || slot.provider_id !== providerId) {
    throw new Error("Slot not found for provider.");
  }
  if (slot.is_booked) {
    throw new Error("Selected slot is already booked.");
  }

  const hasConflict = await checkCalendarConflict(phoneValue, slot.date, slot.time);
  if (hasConflict) {
    throw new Error("User already has an appointment at this time.");
  }

  // Get or Create User
  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
  });
  let user = null;
  for (const item of users) {
    if (normalizePhoneKey(item.phone) === phoneDigits) {
      user = item;
      break;
    }
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: userName.trim(),
        phone: phoneValue,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: userName.trim() || user.name,
        phone: phoneValue,
      },
    });
  }

  // Create Appointment & update slot in one transaction
  const [appointment] = await prisma.$transaction([
    prisma.appointment.create({
      data: {
        request_id: idempotencyKey,
        user_id: user.id,
        provider_id: providerId,
        date: slot.date,
        time: slot.time,
        status: "confirmed",
      },
      include: {
        user: true,
        provider: true,
      },
    }),
    prisma.slot.update({
      where: { id: slotId },
      data: { is_booked: true },
    }),
  ]);

  return appointment;
}

export async function cancelAppointment(appointmentId, reason = null, cancelledBy = "patient", cancelledVia = "bot") {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!appointment) throw new Error("Appointment not found.");

  const calendarEventId = (appointment.google_calendar_event_id || "").trim() || null;

  if (appointment.status === "cancelled") {
    if (calendarEventId) {
      const [_, ok] = await deleteGoogleCalendarEvent(calendarEventId);
      if (ok) {
        await prisma.appointment.update({
          where: { id: appointmentId },
          data: { google_calendar_event_id: null },
        });
      }
    }
    return prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { user: true, provider: true },
    });
  }

  // Free the slot
  const slot = await prisma.slot.findFirst({
    where: {
      provider_id: appointment.provider_id,
      date: appointment.date,
      time: appointment.time,
    },
  });
  if (slot) {
    await prisma.slot.update({
      where: { id: slot.id },
      data: { is_booked: false },
    });
  }

  let updatedAppt = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: "cancelled",
      cancelled_by: (cancelledBy || "patient").trim().toLowerCase(),
      cancelled_via: (cancelledVia || "bot").trim().toLowerCase(),
      cancellation_reason: (reason || "cancelled by patient through bot").trim(),
    },
    include: { user: true, provider: true },
  });

  if (calendarEventId) {
    const [_, ok] = await deleteGoogleCalendarEvent(calendarEventId);
    if (ok) {
      updatedAppt = await prisma.appointment.update({
        where: { id: appointmentId },
        data: { google_calendar_event_id: null },
        include: { user: true, provider: true },
      });
    }
  }

  return updatedAppt;
}

export async function rescheduleAppointment(appointmentId, newSlotId, idempotencyKey = null) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { user: true, provider: true },
  });
  if (!appointment) throw new Error("Appointment not found.");
  if (appointment.status !== "confirmed") {
    throw new Error("Only confirmed appointments can be rescheduled.");
  }

  if (idempotencyKey && appointment.request_id === idempotencyKey) {
    return [appointment, "", false];
  }

  const oldCalendarEventId = (appointment.google_calendar_event_id || "").trim() || null;

  const newSlot = await prisma.slot.findUnique({
    where: { id: newSlotId },
  });
  if (!newSlot) throw new Error("New slot not found.");
  if (newSlot.provider_id !== appointment.provider_id) {
    throw new Error("New slot must belong to the same provider.");
  }

  const currentSlot = await prisma.slot.findFirst({
    where: {
      provider_id: appointment.provider_id,
      date: appointment.date,
      time: appointment.time,
    },
  });
  if (currentSlot && currentSlot.id === newSlotId) {
    throw new Error("That is already your current appointment time.");
  }
  if (newSlot.is_booked) {
    throw new Error("Requested new slot is already booked.");
  }

  const conflict = await prisma.appointment.findFirst({
    where: {
      user_id: appointment.user_id,
      date: newSlot.date,
      time: newSlot.time,
      status: "confirmed",
      id: { not: appointmentId },
    },
  });
  if (conflict) {
    throw new Error("User already has another appointment at requested time.");
  }

  // Update slots and appointment inside transaction
  const updatePromises = [
    prisma.slot.update({
      where: { id: newSlotId },
      data: { is_booked: true },
    }),
    prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        date: newSlot.date,
        time: newSlot.time,
        reminder_sent_at: null,
        request_id: idempotencyKey || appointment.request_id,
      },
      include: { user: true, provider: true },
    }),
  ];
  if (currentSlot) {
    updatePromises.push(
      prisma.slot.update({
        where: { id: currentSlot.id },
        data: { is_booked: false },
      })
    );
  }

  const [_, updatedAppt] = await prisma.$transaction(updatePromises);

  let finalAppt = updatedAppt;

  if (oldCalendarEventId) {
    const [_, ok] = await deleteGoogleCalendarEvent(oldCalendarEventId);
    if (ok) {
      finalAppt = await prisma.appointment.update({
        where: { id: appointmentId },
        data: { google_calendar_event_id: null },
        include: { user: true, provider: true },
      });
    }
  }

  const calendarDetail = await addToCalendar(finalAppt);
  finalAppt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { user: true, provider: true },
  });

  return [finalAppt, calendarDetail, true];
}

export async function addToCalendar(appointment) {
  // Merge date and time parts
  const apptDate = new Date(appointment.date);
  const apptTime = new Date(appointment.time);
  const startDatetime = new Date(
    apptDate.getFullYear(),
    apptDate.getMonth(),
    apptDate.getDate(),
    apptTime.getHours(),
    apptTime.getMinutes(),
    apptTime.getSeconds()
  );

  const slot = await prisma.slot.findFirst({
    where: {
      provider_id: appointment.provider_id,
      date: appointment.date,
      time: appointment.time,
    },
  });

  let endDatetime = null;
  if (slot && slot.end_time) {
    const slotEndTime = new Date(slot.end_time);
    endDatetime = new Date(
      apptDate.getFullYear(),
      apptDate.getMonth(),
      apptDate.getDate(),
      slotEndTime.getHours(),
      slotEndTime.getMinutes(),
      slotEndTime.getSeconds()
    );
  }

  const summary = `Appointment with ${appointment.provider.name}`;
  const description =
    `Service: ${appointment.provider.service}\n` +
    `Patient: ${appointment.user.name}\n` +
    `Phone: ${appointment.user.phone || "Not provided"}\n` +
    `Appointment ID: ${appointment.id}`;

  try {
    const [message, eventId] = await createGoogleCalendarEvent({
      summary,
      description,
      startDatetime,
      durationMinutes: 30,
      endDatetime,
    });
    if (eventId) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { google_calendar_event_id: eventId },
      });
    }
    return message;
  } catch (error) {
    return `Calendar sync failed: ${error.message}`;
  }
}

function withinWindow(timeVal, window) {
  if (!window) return true;
  const normalized = window.trim().toLowerCase();

  const d = new Date(timeVal);
  const hour = d.getUTCHours();

  if (normalized === "morning") {
    return hour >= 8 && hour < 12;
  }
  if (normalized === "afternoon") {
    return hour >= 12 && hour < 17;
  }
  if (normalized === "evening") {
    return hour >= 17 && hour < 21;
  }
  return true;
}

export async function findServiceAvailability(
  service,
  requestedDateStr,
  preferredTimeStr = null,
  timeWindow = null,
  doctorName = null
) {
  let providers = await getProviders(service);
  if (providers.length === 0) {
    return [false, "No providers found for this service.", null, []];
  }

  if (doctorName && doctorName.trim()) {
    const hint = doctorName.trim().toLowerCase();
    const norm = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const hintN = norm(hint);

    let named = providers.filter((p) => hintN && norm(p.name).includes(hintN));
    if (named.length === 0) {
      const pool = {};
      const candidates = [];
      for (const p of providers) {
        const key = norm(p.name);
        pool[key] = p;
        candidates.push(key);
      }
      const matched = getCloseMatches(hintN, candidates, 1, 0.72);
      if (matched.length > 0) {
        named = [pool[matched[0]]];
      }
    }

    if (named.length > 0) {
      providers = named;
    } else {
      return [false, `No provider matched '${doctorName.trim()}' for this service.`, null, []];
    }
  }

  const providerIds = providers.map((p) => p.id);
  const requestedDate = new Date(requestedDateStr + "T00:00:00Z");

  let slots = await prisma.slot.findMany({
    where: {
      provider_id: { in: providerIds },
      date: requestedDate,
      is_booked: false,
    },
    include: { provider: true },
    orderBy: { time: "asc" },
  });

  slots = slots.filter((slot) => withinWindow(slot.time, timeWindow));

  if (slots.length === 0) {
    let upcoming = await prisma.slot.findMany({
      where: {
        provider_id: { in: providerIds },
        date: { gte: requestedDate },
        is_booked: false,
      },
      include: { provider: true },
      orderBy: [
        { date: "asc" },
        { time: "asc" },
      ],
      take: 50,
    });
    upcoming = upcoming.filter((slot) => withinWindow(slot.time, timeWindow));
    if (upcoming.length > 0) {
      return [
        false,
        "No slots available on requested date. Here are the next available options.",
        upcoming[0],
        upcoming.slice(0, 3),
      ];
    }
    return [false, "No available slots found for that date/time window.", null, []];
  }

  const preferredRaw = (preferredTimeStr || "").trim();
  const preferred = parsePreferredTime(preferredTimeStr);
  const timeUnparsed = preferredRaw && !preferred;

  if (timeUnparsed) {
    return [
      true,
      "Time format was unclear; here are available slots on that date from the system.",
      slots[0],
      slots.slice(0, 3),
    ];
  }

  if (preferred) {
    const prefHour = preferred.getUTCHours();
    const prefMin = preferred.getUTCMinutes();

    const exactMatch = slots.find((slot) => {
      const d = new Date(slot.time);
      return d.getUTCHours() === prefHour && d.getUTCMinutes() === prefMin;
    });

    if (exactMatch) {
      return [true, "Requested time is available.", exactMatch, slots.slice(0, 3)];
    }

    const alternatives = [...slots].sort((a, b) => {
      const da = new Date(a.time);
      const db = new Date(b.time);
      const diffA = Math.abs((da.getUTCHours() * 60 + da.getUTCMinutes()) - (prefHour * 60 + prefMin));
      const diffB = Math.abs((db.getUTCHours() * 60 + db.getUTCMinutes()) - (prefHour * 60 + prefMin));
      return diffA - diffB;
    });

    return [
      false,
      "Requested time is not available. Here are nearest alternatives.",
      alternatives[0],
      alternatives.slice(0, 3),
    ];
  }

  return [true, "Available slots found.", slots[0], slots.slice(0, 3)];
}

