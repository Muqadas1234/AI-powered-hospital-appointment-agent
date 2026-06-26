import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET_KEY || "change_this_in_production";

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compareSync(plainPassword, passwordHash);
}

export function createAccessToken(subject, role, expiresMinutes = 60) {
  const payload = {
    sub: subject,
    role: role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${expiresMinutes}m` });
}

export function decodeToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}
export function getJwtSecret() {
  return JWT_SECRET;
}
