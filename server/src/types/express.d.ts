declare namespace Express {
  interface Request {
    cookies: Record<string, string>;
    csrfToken?: string;
    userId?: string;
    userRole?: import("../repositories/types.js").UserRole;
  }
}
