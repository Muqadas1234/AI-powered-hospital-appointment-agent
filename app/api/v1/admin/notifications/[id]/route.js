import { jsonResponse, verifyAdmin } from "../../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../../lib/prisma.js";

export async function DELETE(req, { params }) {
  try {
    await verifyAdmin(req);
    const logId = parseInt(params.id, 10);

    const log = await prisma.notificationLog.findUnique({
      where: { id: logId },
    });
    if (!log) {
      return jsonResponse({ detail: "Notification log not found." }, 404);
    }

    await prisma.notificationLog.delete({
      where: { id: logId },
    });

    return jsonResponse({
      appointment_id: 0,
      status: "deleted",
      detail: "Notification log removed from database.",
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
