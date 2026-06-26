import { jsonResponse, toolHandler } from "../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../lib/prisma.js";

export async function POST(req) {
  return toolHandler(req, async (r) => {
    const body = await r.json();
    const question = body.question || "";
    const normalized = question.trim().toLowerCase();

    if (!normalized) {
      return jsonResponse({ answer: "Please ask a question." });
    }

    const faqs = await prisma.faq.findMany({
      where: { is_active: true },
    });

    const exact = faqs.find((f) => f.question.toLowerCase() === normalized);
    if (exact) {
      return jsonResponse({ answer: exact.answer });
    }

    const contains = faqs.find(
      (f) =>
        f.question.toLowerCase().includes(normalized) ||
        normalized.includes(f.question.toLowerCase())
    );
    if (contains) {
      return jsonResponse({ answer: contains.answer });
    }

    return jsonResponse({
      answer: "Sorry, I could not find an exact answer. Please ask a staff member.",
    });
  });
}
