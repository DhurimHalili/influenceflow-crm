import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { uid } from "../lib/utils";

type ToastKind = "success" | "error" | "info";
/** An optional one-tap action on the toast, e.g. Undo. */
export type ToastAction = { label: string; run: () => void };
type ToastItem = { id: string; message: string; kind: ToastKind; action?: ToastAction };
type ToastContextValue = { toast: (message: string, kind?: ToastKind, action?: ToastAction) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, kind: ToastKind = "success", action?: ToastAction) => {
    const id = uid();
    setItems((current) => [...current, { id, message, kind, action }]);
    // A toast with an action stays long enough to use it.
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), action ? 7000 : 3200);
  }, []);
  const remove = (id: string) => setItems((current) => current.filter((item) => item.id !== id));
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        <AnimatePresence>
          {items.map((item) => {
            const Icon = item.kind === "success" ? CheckCircle2 : item.kind === "error" ? CircleAlert : Info;
            return (
              <motion.div key={item.id} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }} className={`toast toast-${item.kind}`}>
                <Icon size={18} />
                <span>{item.message}</span>
                {item.action && <button type="button" className="toast-action" onClick={() => { item.action!.run(); remove(item.id); }}>{item.action.label}</button>}
                <button onClick={() => remove(item.id)} aria-label="Dismiss notification"><X size={15} /></button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
};