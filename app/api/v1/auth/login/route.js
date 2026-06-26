import { jsonResponse } from "../../../../../lib/api-helpers.js";
import { hashPassword, verifyPassword, createAccessToken } from "../../../../../lib/auth.js";
import { prisma } from "../../../../../lib/prisma.js";

export async function POST(req) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return jsonResponse({ detail: "Username and password required." }, 400);
    }

    // Ensure default admin user exists
    const defaultUsername = (process.env.ADMIN_USERNAME || "admin").trim();
    const defaultPassword = (process.env.ADMIN_PASSWORD || "admin123").trim();
    const defaultRole = (process.env.ADMIN_ROLE || "admin").trim() || "admin";

    const defaultAdmin = await prisma.adminUser.findUnique({
      where: { username: defaultUsername },
    });

    if (!defaultAdmin) {
      await prisma.adminUser.create({
        data: {
          username: defaultUsername,
          password_hash: hashPassword(defaultPassword),
          role: defaultRole,
          is_active: true,
        },
      });
    }

    // Authenticate
    const user = await prisma.adminUser.findFirst({
      where: { username: username.trim(), is_active: true },
    });

    if (!user || !verifyPassword(password, user.password_hash)) {
      return jsonResponse({ detail: "Invalid username or password." }, 401);
    }

    const token = createAccessToken(user.username, user.role);
    return jsonResponse({
      access_token: token,
      token_type: "bearer",
      role: user.role,
    });
  } catch (error) {
    return jsonResponse({ detail: error.message }, 500);
  }
}
