import { jsonResponse } from "../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../lib/prisma.js";

export const dynamic = 'force-dynamic';


export async function GET(req) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const providers = await prisma.provider.findMany({
      where: { is_active: true },
      include: {
        slots: {
          where: {
            is_booked: false,
            date: { gte: today },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    const result = providers.map((p) => ({
      id: p.id,
      name: p.name,
      service: p.service,
      fee_pkr: p.fee_pkr,
      is_active: p.is_active,
      available_slots_count: p.slots.length,
    }));

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ detail: error.message }, 500);
  }
}

