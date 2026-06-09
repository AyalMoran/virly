import type { NextFunction, Request, Response } from "express";
import { User, type UserRole } from "../models/User.js";

export function isSupportVideoRole(role: UserRole) {
  return role === "support_agent" || role === "support_manager" || role === "admin";
}

export function isSalesVideoRole(role: UserRole) {
  return role === "sales_agent" || role === "admin";
}

export function getAllowedVideoSessionTypes(role: UserRole) {
  return {
    support: isSupportVideoRole(role),
    sales: isSalesVideoRole(role)
  };
}

export async function requireAnyVideoAgentRole(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const user = await User.findById(req.userId).select("role");
    const role = (user?.role ?? "user") as UserRole;
    if (!user || (!isSupportVideoRole(role) && !isSalesVideoRole(role))) {
      return res.status(403).json({ message: "Video agent access required." });
    }

    req.userRole = role;
    next();
  } catch (error) {
    next(error);
  }
}

