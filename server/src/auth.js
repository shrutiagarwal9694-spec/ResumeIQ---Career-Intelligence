import jwt from "jsonwebtoken";
import db from "./db.js";
import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDirectory, "../.env") });
const localSecretPath = path.join(serverDirectory, "../data/.jwt-secret");

function readLocalSecret() {
  mkdirSync(path.dirname(localSecretPath), { recursive: true });
  try {
    const secret = readFileSync(localSecretPath, "utf8").trim();
    if (secret) return secret;
    throw new Error("Local JWT secret file is empty.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const secret = randomBytes(32).toString("hex");
    try {
      writeFileSync(localSecretPath, secret, { flag: "wx", mode: 0o600 });
      return secret;
    } catch (writeError) {
      if (writeError.code !== "EEXIST") throw writeError;
      return readFileSync(localSecretPath, "utf8").trim();
    }
  }
}

const jwtSecret = process.env.JWT_SECRET || readLocalSecret();

export function signToken(user) {
  return jwt.sign(
    { id: user.id, ver: user.auth_version ?? 0 },
    jwtSecret,
    { expiresIn: "7d" }
  );
}

export function hashForStorage(value) {
  return createHmac("sha256", jwtSecret).update(value).digest("hex");
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required" });

  try {
    const claims = jwt.verify(token, jwtSecret);
    const userId = Number(claims.id);
    if (!Number.isSafeInteger(userId)) return res.status(401).json({ message: "Invalid or expired session" });
    const user = db.prepare("SELECT id,auth_version FROM users WHERE id=?").get(userId);
    if (!user || Number(claims.ver ?? 0) !== user.auth_version) return res.status(401).json({ message: "Invalid or expired session" });
    db.prepare("UPDATE users SET last_active_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id);
    req.user = { id: user.id };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

export function requireAdmin(req, res, next) {
  const user = db.prepare("SELECT role FROM users WHERE id=?").get(req.user.id);
  if (!user) return res.status(401).json({ message: "Invalid or expired session" });
  if (user.role !== "admin") return res.status(403).json({ message: "Administrator access required." });
  req.user.role = user.role;
  next();
}
