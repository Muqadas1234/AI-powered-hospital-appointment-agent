import { jsonResponse } from "../../../../../lib/api-helpers.js";
import { prisma } from "../../../../../lib/prisma.js";

export const dynamic = 'force-dynamic';


export async function GET(req) {
  try {
    const providers = await prisma.provider.findMany({
      where: { is_active: true },
      orderBy: { id: "asc" },
    });
    return jsonResponse(providers);
  } catch (error) {
    return jsonResponse({ detail: error.message }, 500);
  }
}
