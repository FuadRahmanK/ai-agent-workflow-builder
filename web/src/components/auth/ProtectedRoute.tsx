"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { nhost } from "@/src/lib/nhost";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({
  children,
}: ProtectedRouteProps) {
  const router = useRouter();

  const [checking, setChecking] =
    useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkAuthentication() {
      try {
        const session =
          nhost.getUserSession();

        if (
          !session?.user?.id
        ) {
          router.replace("/login");
          return;
        }

        if (!cancelled) {
          setChecking(false);
        }
      } catch (error) {
        console.error(
          "Authentication check failed:",
          error
        );

        router.replace("/login");
      }
    }

    void checkAuthentication();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) {
    return (
      <main className="auth-loading">
        <p>Checking authentication...</p>
      </main>
    );
  }

  return <>{children}</>;
}