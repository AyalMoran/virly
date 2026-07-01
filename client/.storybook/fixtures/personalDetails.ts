/**
 * Personal-details (KYC) fixtures used by the Settings page stories.
 */
import type {
  PersonalDetails,
  PersonalDetailsResponse,
} from "@/lib/types";

export const personalDetailsFixture: PersonalDetails = {
  id: "pd_test_0001",
  status: "provided",
  firstName: "Test",
  lastName: "Recipient",
  dateOfBirth: "1990-05-20",
  address: {
    country: "Israel",
    stateRegion: "Tel Aviv District",
    city: "Tel Aviv",
    street: "12 Rothschild Blvd",
    addressLine2: null,
    postalCode: "6688101",
  },
  lastSkippedAt: null,
  createdAt: "2026-01-15T09:00:00.000Z",
  updatedAt: "2026-06-01T09:00:00.000Z",
};

/** Brand-new account that has not provided details yet. */
export const emptyPersonalDetailsFixture: PersonalDetails = {
  id: "pd_test_0002",
  status: "not_provided",
  firstName: null,
  lastName: null,
  dateOfBirth: null,
  address: {
    country: null,
    stateRegion: null,
    city: null,
    street: null,
    addressLine2: null,
    postalCode: null,
  },
  lastSkippedAt: null,
};

export const personalDetailsResponseFixture: PersonalDetailsResponse = {
  personalDetails: personalDetailsFixture,
};
