declare namespace Express {
  interface Request {
    cookies: Record<string, string>;
    csrfToken?: string;
    userId?: string;
    userRole?: import("../models/User.js").UserRole;
  }
}
