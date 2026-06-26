import { jsonResponse, verifyAdmin } from "../../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../../lib/prisma.js";

export async function PUT(req, { params }) {
  try {
    await verifyAdmin(req);
    const providerId = parseInt(params.id, 10);
    const body = await req.json();

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      return jsonResponse({ detail: "Provider not found." }, 404);
    }

    const updateData = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.service !== undefined) updateData.service = body.service.trim().toLowerCase();
    if (body.fee_pkr !== undefined) updateData.fee_pkr = body.fee_pkr !== null && body.fee_pkr !== "" ? parseInt(body.fee_pkr, 10) : null;
    if (body.is_active !== undefined) updateData.is_active = !!body.is_active;

    const updatedProvider = await prisma.provider.update({
      where: { id: providerId },
      data: updateData,
    });

    const activeCount = await prisma.appointment.count({
      where: {
        provider_id: providerId,
        status: "confirmed",
      },
    });

    return jsonResponse({
      ...updatedProvider,
      active_appointments_count: activeCount,
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
