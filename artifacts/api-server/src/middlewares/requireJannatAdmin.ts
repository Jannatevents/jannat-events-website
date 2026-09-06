import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

const ADMIN_EMAIL = "contactthejannat@gmail.com";

export async function isJannatAdmin(req: Request): Promise<boolean> {
  const userId = getAuth(req).userId;
  if (!userId) return false;

  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses.some(
    ({ emailAddress }) => emailAddress.toLowerCase() === ADMIN_EMAIL,
  );
}

export async function requireJannatAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    if (!(await isJannatAdmin(req))) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  } catch {
    res.status(503).json({ error: "Unable to verify admin access" });
  }
}