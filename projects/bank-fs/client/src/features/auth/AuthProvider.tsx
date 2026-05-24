import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { ReactNode } from "react";
import { api, setUnauthorizedHandler } from "../../lib/api";
import type {
  AuthSuccessResponse,
  LoginRequest,
  RegisterRequest,
  User
} from "../../lib/types";

type AuthState = {
  user: User | null;
  isLoading: boolean;
};

type AuthContextValue = AuthState & {
  isAuthenticated: boolean;
  login: (payload: LoginRequest) => Promise<User>;
  register: (payload: RegisterRequest) => Promise<string>;
  verify: (token: string) => Promise<User>;
  resendVerification: (email: string) => Promise<string>;
  logout: () => Promise<void>;
  setSession: (user: User) => void;
  updateBalance: (balance: number) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true
  });

  const clearSession = useCallback(() => {
    setState({ user: null, isLoading: false });
  }, []);

  const setSession = useCallback((user: User) => {
    setState({ user, isLoading: false });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    let isMounted = true;

    api
      .me()
      .then((response) => {
        if (isMounted) {
          setSession(response.user);
        }
      })
      .catch(() => {
        if (isMounted) {
          clearSession();
        }
      });

    return () => {
      isMounted = false;
    };
  }, [clearSession, setSession]);

  const confirmAndSetSession = useCallback(
    async (response: AuthSuccessResponse) => {
      setSession(response.user);
      return response.user;
    },
    [setSession]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: Boolean(state.user),
      async login(payload) {
        const response = await api.login(payload);
        return confirmAndSetSession(response);
      },
      async register(payload) {
        const response = await api.register(payload);
        return response.message;
      },
      async verify(token) {
        const response = await api.verify(token);
        return confirmAndSetSession(response);
      },
      async resendVerification(email) {
        const response = await api.resendVerification(email);
        return response.message;
      },
      async logout() {
        try {
          if (state.user) {
            await api.logout();
          }
        } finally {
          clearSession();
        }
      },
      setSession,
      updateBalance(balance) {
        if (!state.user) {
          return;
        }

        setSession({ ...state.user, balance });
      }
    }),
    [clearSession, confirmAndSetSession, setSession, state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
