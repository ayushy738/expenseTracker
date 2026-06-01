"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastItem = { id: string; title: string; description?: string };
type ToastContextValue = { toast: (item: Omit<ToastItem, "id">) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside Toaster");
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((item: Omit<ToastItem, "id">) => {
    setItems((current) => [...current, { ...item, id: crypto.randomUUID() }]);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastPrimitive.Provider swipeDirection="right">
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            className={cn("glass fixed right-4 top-4 z-[100] w-[calc(100vw-2rem)] rounded-xl p-4 shadow-soft sm:w-96")}
            onOpenChange={(open) => {
              if (!open) setItems((current) => current.filter((toastItem) => toastItem.id !== item.id));
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <ToastPrimitive.Title className="font-semibold">{item.title}</ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close className="rounded-md p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </ToastPrimitive.Close>
            </div>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function Toaster() {
  return null;
}
