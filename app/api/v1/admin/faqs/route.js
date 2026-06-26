import { jsonResponse, verifyAdmin } from "../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../lib/prisma.js";

export async function GET(req) {
  try {
    await verifyAdmin(req);
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("include_inactive") !== "false";

    const faqs = await prisma.faq.findMany({
      where: includeInactive ? {} : { is_active: true },
      orderBy: { id: "asc" },
    });

    return jsonResponse(faqs);
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}

export async function POST(req) {
  try {
    const admin = await verifyAdmin(req);
    const body = await req.json();

    if (!body.question || !body.answer) {
      return jsonResponse({ detail: "Question and answer are required." }, 400);
    }

    const normalizedQuestion = body.question.trim().toLowerCase();

    const existing = await prisma.faq.findUnique({
      where: { question: normalizedQuestion },
    });

    if (existing) {
      if (existing.is_active) {
        return jsonResponse({ detail: "FAQ question already exists." }, 400);
      } else {
        const updated = await prisma.faq.update({
          where: { id: existing.id },
          data: {
            answer: body.answer.trim(),
            is_active: true,
            created_by: admin.username,
          },
        });
        return jsonResponse(updated);
      }
    }

    const faq = await prisma.faq.create({
      data: {
        question: normalizedQuestion,
        answer: body.answer.trim(),
        is_active: true,
        created_by: admin.username,
      },
    });

    return jsonResponse(faq);
  } catch (error) {
    return jsonResponse({ detail: error.message }, error.message.includes("token") || error.message.includes("auth") ? 401 : 500);
  }
}
