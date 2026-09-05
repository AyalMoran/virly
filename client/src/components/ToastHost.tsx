import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Toast = { id: number; title: string; body?: string };
type ToastContextValue = { pushToast: (title: string, body?: string) => void };

const ToastContext = createContext<ToastContextValue>({ pushToast: () => {} });

export function useToasts() {
  return useContext(ToastContext);
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, title, body }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 8000);
  }, []);
  const value = useMemo(() => ({ pushToast }), [pushToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div className="banner banner-error toast" key={toast.id}>
            <strong>{toast.title}</strong>
            {toast.body ? <span>{toast.body}</span> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
