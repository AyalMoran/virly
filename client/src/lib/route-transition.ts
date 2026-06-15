export const authTransitionState = { transitionFromAuth: true };

const authTransitionKey = "virly-auth-transition";

export function markAuthTransition() {
  sessionStorage.setItem(authTransitionKey, "1");
}

export function hasAuthTransition(locationState: unknown) {
  const state = locationState as { transitionFromAuth?: boolean } | null;
  return Boolean(state?.transitionFromAuth) || sessionStorage.getItem(authTransitionKey) === "1";
}

export function clearAuthTransition() {
  sessionStorage.removeItem(authTransitionKey);
}
