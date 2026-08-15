"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { nhost } from "@/src/lib/nhost";

export default function LogoutButton() {
  const router = useRouter();

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function handleLogout() {
    if (loading) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const session =
        nhost.getUserSession();

    if (session?.refreshToken) {
        await nhost.auth.signOut({
            refreshToken: session.refreshToken,
        });
    }

      router.replace("/login");
    } catch (err) {
      console.error(
        "Logout error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Logout failed."
      );

      setLoading(false);
    }
  }

  return (
    <div className="logout-container">
      <button
        type="button"
        onClick={() => {
          void handleLogout();
        }}
        disabled={loading}
        className="logout-button"
      >
        {loading
          ? "Signing out..."
          : "Sign out"}
      </button>

      {error && (
        <span className="logout-error">
          {error}
        </span>
      )}
    </div>
  );
}