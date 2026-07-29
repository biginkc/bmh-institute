export type LearnerAccessStatusKey =
  | "ready"
  | "missing_access"
  | "inactive"
  | "suspended";

export type LearnerAccessRow = {
  id: string;
  email: string;
  name: string;
  systemRole: "owner" | "admin" | "learner";
  statusKey: LearnerAccessStatusKey;
  statusLabel: string;
  accessLabel: string;
  createdAt: string;
  roleGroupIds: string[];
};

export type LearnerAccessProfileInput = {
  id: string;
  email: string | null;
  full_name: string | null;
  system_role: "owner" | "admin" | "learner";
  status: "active" | "invited" | "suspended";
  created_at: string;
};

export function shapeLearnerAccessRows({
  profiles,
  userRoleGroupsByUserId,
}: {
  profiles: LearnerAccessProfileInput[];
  userRoleGroupsByUserId: Record<string, string[]>;
}): LearnerAccessRow[] {
  return profiles
    .map((profile) => {
      const roleGroupIds = userRoleGroupsByUserId[profile.id] ?? [];
      const accessLabel =
        roleGroupIds.length > 0
          ? "Role group assigned"
          : "No role group assigned";
      const status = getProfileStatus(profile.status, roleGroupIds);

      return {
        id: profile.id,
        email: profile.email ?? "",
        name: profile.full_name || profile.email || "Unnamed learner",
        systemRole: profile.system_role,
        statusKey: status.key,
        statusLabel: status.label,
        accessLabel,
        createdAt: profile.created_at,
        roleGroupIds,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function getProfileStatus(
  status: LearnerAccessProfileInput["status"],
  roleGroupIds: string[],
): { key: LearnerAccessStatusKey; label: string } {
  if (status === "suspended") {
    return { key: "suspended", label: "Suspended" };
  }
  if (status !== "active") {
    return { key: "inactive", label: "Not active" };
  }
  if (roleGroupIds.length === 0) {
    return { key: "missing_access", label: "Needs access" };
  }
  return { key: "ready", label: "Ready" };
}
