export type OrgRole =
  | "owner"
  | "editor"
  | "viewer";

export interface Organization {
  id: string;
  name: string;
  quota_limit: number;
  quota_used: number;
}

export interface OrganizationMembership {
  id: string;
  role: OrgRole;
  organization: Organization;
}