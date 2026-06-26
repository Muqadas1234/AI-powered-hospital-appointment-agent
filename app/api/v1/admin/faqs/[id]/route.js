import { jsonResponse, verifyAdmin } from "../../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../../lib/prisma.js";

export async function PUT(req, { params }) {
  try {
    await verifyAdmin(req);
    const faqId = parseInt(params.id, 10);
    const body = await req.json();

    const faq = await prisma.faq.findUnique({
      where: { id: faqId },
    });
    if (!faq) {
      return jsonResponse({ detail: "FAQ not found." }, 404);
    }

    const updateData = {};
    if (body.question !== undefined) {
      const normalizedQuestion = body.question.trim().toLowerCase();
      const duplicate = await prisma.faq.findFirst({
        where: {
          question: normalizedQuestion,
          id: { not: faqId },
          is_active: true,
        },
      });
      if (duplicate) {
        return jsonResponse({ detail: "Another active FAQ already uses this question." }, 400);
      }
      updateData.question = normalizedQuestion;
    }
    if (body.answer !== undefined) updateData.answer = body.answer.trim();
    if (body.is_active !== undefined) updateData.is_active = !!body.is_active;

    const updatedFaq = await prisma.faq.update({
      where: { id: faqId },
      data: updateData,
    });

    return jsonResponse(updatedFaq);
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}

export async function DELETE(req, { params }) {
  try {
    await verifyAdmin(req);
    const faqId = parseInt(params.id, 10);

    const faq = await prisma.faq.findUnique({
      where: { id: faqId },
    });
    if (!faq) {
      return jsonResponse({ detail: "FAQ not found." }, 404);
    }

    await prisma.faq.delete({
      where: { id: faqId },
    });

    return jsonResponse({
      appointment_id: 0,
      status: "deleted",
      detail: "FAQ deleted successfully.",
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
