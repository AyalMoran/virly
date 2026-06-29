import jwt from "jsonwebtoken";
import {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  createToken,
  createVerificationToken,
  verifyVerificationToken
} from "../auth.js";
import { config } from "../../config.js";

describe("cookie name constants", () => {
  test("are stable, distinct identifiers", () => {
    expect(AUTH_COOKIE_NAME).toBe("virly_auth");
    expect(CSRF_COOKIE_NAME).toBe("virly_csrf");
    expect(AUTH_COOKIE_NAME).not.toBe(CSRF_COOKIE_NAME);
  });
});

describe("createToken", () => {
  test("signs a session JWT carrying userId and csrfTokenHash", () => {
    const token = createToken("user-1", "csrf-hash");
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    expect(payload.userId).toBe("user-1");
    expect(payload.csrfTokenHash).toBe("csrf-hash");
  });

  test("rememberMe extends the expiry beyond the default session length", () => {
    const normal = jwt.decode(createToken("u", "h")) as jwt.JwtPayload;
    const persistent = jwt.decode(
      createToken("u", "h", { rememberMe: true })
    ) as jwt.JwtPayload;
    expect(persistent.exp!).toBeGreaterThan(normal.exp!);
  });
});

describe("verification tokens", () => {
  test("round-trips a userId through create + verify", () => {
    const token = createVerificationToken("507f1f77bcf86cd799439011");
    expect(verifyVerificationToken(token)).toStrictEqual({
      userId: "507f1f77bcf86cd799439011"
    });
  });

  test("rejects a token whose purpose is not email-verification", () => {
    const wrongPurpose = jwt.sign(
      { sub: "u", purpose: "password-reset" },
      config.jwtSecret
    );
    expect(() => verifyVerificationToken(wrongPurpose)).toThrow(
      /Invalid verification token/
    );
  });

  test("rejects a token signed with a different secret", () => {
    const forged = jwt.sign(
      { sub: "u", purpose: "email-verification" },
      "not-the-real-secret"
    );
    expect(() => verifyVerificationToken(forged)).toThrow();
  });

  test("rejects a structurally invalid token", () => {
    expect(() => verifyVerificationToken("not-a-jwt")).toThrow();
  });
});
