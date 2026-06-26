import { jsonResponse, verifyAdmin } from "../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../lib/prisma.js";

export async function GET(req) {
  try {
    await verifyAdmin(req);
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("include_inactive") !== "false";

    const providers = await prisma.provider.findMany({
      where: includeInactive ? {} : { is_active: true },
      include: {
        appointments: {
          where: { status: "confirmed" },
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
      active_appointments_count: p.appointments.length,
      created_by: p.created_by,
    }));

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}

export async function POST(req) {
  try {
    const admin = await verifyAdmin(req);
    const body = await req.json();

    if (!body.name || !body.service) {
      return jsonResponse({ detail: "Name and service are required." }, 400);
    }

    const provider = await prisma.provider.create({
      data: {
        name: body.name.trim(),
        service: body.service.trim().toLowerCase(),
        fee_pkr: body.fee_pkr ? parseInt(body.fee_pkr, 10) : null,
        is_active: true,
        created_by: admin.username,
      },
    });

    return jsonResponse({
      ...provider,
      active_appointments_count: 0,
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
