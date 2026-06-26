import { jsonResponse, toolHandler } from "../../../../../lib/api-helpers.js";
import { getProviders } from "../../../../../lib/booking.js";

function toVoiceServiceLabel(rawService) {
  const value = (rawService || "").trim().toLowerCase();
  if (value === "dentist") return "dental checkup";
  if (value === "dentistry") return "dentistry";
  if (value === "dermatologist") return "skin consultation";
  if (value === "dermatology") return "dermatology";
  if (value === "general") return "Medicine OPD";
  return rawService;
}

async function handleGetProviders(service) {
  const providers = await getProviders(service);
  const result = providers.map((p) => ({
    id: p.id,
    name: p.name,
    service: toVoiceServiceLabel(p.service),
    fee_pkr: p.fee_pkr,
  }));
  return jsonResponse(result);
}

export async function GET(req) {
  return toolHandler(req, async (r) => {
    const { searchParams } = new URL(r.url);
    const service = searchParams.get("service") || "";
    return handleGetProviders(service);
  });
}

export async function POST(req) {
  return toolHandler(req, async (r) => {
    let service = "";
    try {
      const body = await r.json();
      service = body.service || "";
    } catch (e) {
      // Body may be empty
    }
    return handleGetProviders(service);
  });
}
