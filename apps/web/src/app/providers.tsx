"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import { DataHealer } from "@/components/data-healer";
import { AuthBootstrap } from "@/features/auth/components/auth-bootstrap";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 2,
          },
          mutations: {
            retry: 3,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AuthBootstrap />
      <DataHealer />
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{ duration: 3500 }}
      />
    </QueryClientProvider>
  );
}
