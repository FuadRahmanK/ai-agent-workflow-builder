export type OrgRole = "owner" | "editor" | "viewer";

export function canRunWorkflow(role: OrgRole): boolean {
  return role === "owner" || role === "editor";
}

export function canUseSensitiveStep(
  role: OrgRole,
  stepType: string
): boolean {
  const sensitiveSteps = [
    "db_write",
    "notify"
  ];

  if (sensitiveSteps.includes(stepType)) {
    return role === "owner";
  }

  return role === "owner" || role === "editor";
}

export function canUseWebhookTrigger(role: OrgRole): boolean {
  return role === "owner";
}

export function canApprove(role: OrgRole): boolean {
  return role === "owner" || role === "editor";
}