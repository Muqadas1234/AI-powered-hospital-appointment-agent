import { decodeToken } from "./auth.js";
import { prisma } from "./prisma.js";

export async function verifyAdmin(req) {
  const authDisabled = (process.env.ADMIN_AUTH_DISABLED || "false").trim().toLowerCase() === "true";
  if (authDisabled) {
    const admin = await prisma.adminUser.findFirst({
      where: { is_active: true },
      orderBy: { id: "asc" },
    });
    if (!admin) {
      throw new Error("No active admin user found.");
    }
    return admin;
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing auth token.");
  }

  const token = authHeader.substring(7);
  try {
    const payload = decodeToken(token);
    const username = payload.sub;
    if (!username) {
      throw new Error("Invalid token payload.");
    }

    const admin = await prisma.adminUser.findFirst({
      where: { username, is_active: true },
    });
    if (!admin) {
      throw new Error("Admin user not found or inactive.");
    }
    return admin;
  } catch (error) {
    throw new Error("Invalid auth token.");
  }
}

export function verifyToolApiKey(req) {
  const toolApiKey = (process.env.TOOL_API_KEY || "").trim();
  if (!toolApiKey) return;

  const reqApiKey = req.headers.get("x-api-key") || new URL(req.url).searchParams.get("api_key");
  if (!reqApiKey || reqApiKey !== toolApiKey) {
    throw new Error("Unauthorized tool API access.");
  }
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function toolHandler(req, handlerFn) {
  try {
    verifyToolApiKey(req);
    return await handlerFn(req);
  } catch (error) {
    if (error.message && (error.message.includes("Unauthorized") || error.message.includes("API key"))) {
      return jsonResponse({ detail: "Unauthorized tool API access." }, 401);
    }
    const statusCode = error.statusCode || 500;
    if (statusCode >= 400 && statusCode < 500) {
      return jsonResponse({ detail: error.message }, statusCode);
    }
    console.error("Tool API Error:", error);
    return jsonResponse({
      detail: "SYSTEM_UNAVAILABLE",
      message: "Live hospital system is temporarily unavailable. Please try again shortly.",
    }, 503);
  }
}

