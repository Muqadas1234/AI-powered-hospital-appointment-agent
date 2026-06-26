import { jsonResponse, verifyAdmin } from "../../../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../../../lib/prisma.js";

export async function DELETE(req, { params }) {
  try {
    await verifyAdmin(req);
    const providerId = parseInt(params.id, 10);

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      return jsonResponse({ detail: "Provider not found." }, 404);
    }

    const activeAppt = await prisma.appointment.findFirst({
      where: {
        provider_id: providerId,
        status: "confirmed",
      },
    });

    if (activeAppt) {
      return jsonResponse(
        { detail: "Provider has confirmed appointments. Cancel/reschedule them first." },
        400
      );
    }

    // Delete related slots first
    await prisma.slot.deleteMany({
      where: { provider_id: providerId },
    });

    // Delete provider
    await prisma.provider.delete({
      where: { id: providerId },
    });

    return jsonResponse({
      appointment_id: 0,
      status: "deleted",
      detail: "Provider deleted successfully.",
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
