// client/src/lib/user-profile-cache.ts
import { api } from "./api";
import type { UserProfileResponse } from "./types";

let fetcher: (email: string) => Promise<UserProfileResponse> = (email) =>
  api.userProfile(email);

const cache = new Map<string, Promise<UserProfileResponse>>();

export function fetchUserProfileCached(email: string): Promise<UserProfileResponse> {
  const key = email.toLowerCase();
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const promise = fetcher(email).catch((error) => {
    cache.delete(key); // don't cache failures
    throw error;
  });
  cache.set(key, promise);
  return promise;
}

/** Test hooks. */
export function __resetUserProfileCache(): void {
  cache.clear();
}
export function __setProfileFetcher(fn: (email: string) => Promise<UserProfileResponse>): void {
  fetcher = fn;
}
