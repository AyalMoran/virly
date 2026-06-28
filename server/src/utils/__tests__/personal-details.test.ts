import { toAuthUserDto, toPersonalDetailsDto } from "../personal-details.js";
import type {
  PersonalDetailsRecord,
  UserRecord
} from "../../repositories/types.js";

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "u1",
    email: "alice@example.com",
    passwordHash: "h",
    phone: "+972",
    isVerified: true,
    balance: 500,
    role: "user",
    personalDetails: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function makeDetails(
  overrides: Partial<PersonalDetailsRecord> = {}
): PersonalDetailsRecord {
  return {
    id: "pd1",
    userId: "u1",
    status: "provided",
    firstName: "Alice",
    lastName: "Smith",
    dateOfBirth: new Date("1990-05-04T00:00:00.000Z"),
    address: {
      country: "IL",
      stateRegion: null,
      city: "TLV",
      street: "Main 1",
      addressLine2: null,
      postalCode: "12345"
    },
    lastSkippedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides
  };
}

describe("toAuthUserDto", () => {
  test("projects the auth-facing user fields", () => {
    const dto = toAuthUserDto(makeUser(), makeDetails());
    expect(dto).toStrictEqual({
      id: "u1",
      email: "alice@example.com",
      balance: 500,
      role: "user",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      personalDetailsId: "pd1",
      personalDetailsStatus: "provided",
      needsPersonalDetails: false
    });
  });

  test("flags needsPersonalDetails when status is not provided", () => {
    const dto = toAuthUserDto(makeUser(), makeDetails({ status: "not_provided" }));
    expect(dto.needsPersonalDetails).toBe(true);
  });

  test("defaults role to user when missing", () => {
    const dto = toAuthUserDto(
      makeUser({ role: undefined as never }),
      makeDetails()
    );
    expect(dto.role).toBe("user");
  });
});

describe("toPersonalDetailsDto", () => {
  test("serialises dates to ISO and fills the full address shape", () => {
    const dto = toPersonalDetailsDto(makeDetails());
    expect(dto.dateOfBirth).toBe("1990-05-04T00:00:00.000Z");
    expect(dto.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(dto.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(dto.address).toStrictEqual({
      country: "IL",
      stateRegion: null,
      city: "TLV",
      street: "Main 1",
      addressLine2: null,
      postalCode: "12345"
    });
  });

  test("nulls out optional dates and address fields when absent", () => {
    const dto = toPersonalDetailsDto(
      makeDetails({ dateOfBirth: null, lastSkippedAt: null, address: {} })
    );
    expect(dto.dateOfBirth).toBeNull();
    expect(dto.lastSkippedAt).toBeNull();
    expect(dto.address.country).toBeNull();
    expect(dto.address.postalCode).toBeNull();
  });
});
