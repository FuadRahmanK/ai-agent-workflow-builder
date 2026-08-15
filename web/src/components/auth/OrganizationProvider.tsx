"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { nhost } from "@/src/lib/nhost";
import { graphqlRequest } from "@/src/lib/graphql";
import { GET_MY_ORGANIZATIONS } from "@/src/graphql/organization";

import type {
  OrganizationMembership,
} from "@/src/types/organization";

interface OrganizationContextValue {
  memberships: OrganizationMembership[];

  activeMembership:
    | OrganizationMembership
    | null;

  loading: boolean;

  error: string | null;

  refresh: () => Promise<void>;

  selectOrganization: (
    organizationId: string
  ) => void;
}

const OrganizationContext =
  createContext<OrganizationContextValue | null>(
    null
  );

interface QueryResult {
  org_members: OrganizationMembership[];
}

const ACTIVE_ORGANIZATION_KEY =
  "activeOrganizationId";

export function OrganizationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [memberships, setMemberships] =
    useState<OrganizationMembership[]>([]);

  const [activeOrganizationId, setActiveOrganizationId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  async function loadOrganizations() {
    try {
      setLoading(true);
      setError(null);

      const session =
        nhost.getUserSession();

      if (!session?.user?.id) {
        setMemberships([]);
        setActiveOrganizationId(null);
        return;
      }

      const data =
        await graphqlRequest<
          QueryResult,
          { userId: string }
        >(
          GET_MY_ORGANIZATIONS,
          {
            userId: session.user.id,
          }
        );

      const nextMemberships =
        data.org_members ?? [];

      setMemberships(nextMemberships);

      const storedOrganizationId =
        window.localStorage.getItem(
          ACTIVE_ORGANIZATION_KEY
        );

      const storedMembership =
        nextMemberships.find(
          (membership) =>
            membership.organization.id ===
            storedOrganizationId
        );

      const nextActiveMembership =
        storedMembership ??
        nextMemberships[0] ??
        null;

      const nextOrganizationId =
        nextActiveMembership
          ?.organization.id ?? null;

      setActiveOrganizationId(
        nextOrganizationId
      );

      if (nextOrganizationId) {
        window.localStorage.setItem(
          ACTIVE_ORGANIZATION_KEY,
          nextOrganizationId
        );
      } else {
        window.localStorage.removeItem(
          ACTIVE_ORGANIZATION_KEY
        );
      }
    } catch (err) {
      console.error(
        "Failed to load organizations:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load organizations"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {

      await Promise.resolve();

      if (cancelled) {
        return;
      }

      await loadOrganizations();
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  function selectOrganization(
    organizationId: string
  ) {
    const membership =
      memberships.find(
        (item) =>
          item.organization.id ===
          organizationId
      );

    if (!membership) {
      console.warn(
        "Cannot select organization that is not available to the current user."
      );

      return;
    }

    setActiveOrganizationId(
      organizationId
    );

    window.localStorage.setItem(
      ACTIVE_ORGANIZATION_KEY,
      organizationId
    );
  }

  const activeMembership =
    memberships.find(
      (membership) =>
        membership.organization.id ===
        activeOrganizationId
    ) ??
    memberships[0] ??
    null;

  const value: OrganizationContextValue = {
    memberships,

    activeMembership,

    loading,

    error,

    refresh: loadOrganizations,

    selectOrganization,
  };

  return (
    <OrganizationContext.Provider
      value={value}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context =
    useContext(OrganizationContext);

  if (!context) {
    throw new Error(
      "useOrganization must be used inside OrganizationProvider"
    );
  }

  return context;
}