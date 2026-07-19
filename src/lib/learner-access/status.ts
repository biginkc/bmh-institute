export type LearnerAccessStatusKey =
  | "ready"
  | "missing_access"
  | "suspended"
  | "pending_invite"
  | "expired_invite";

export type LearnerAccessRow = {
  kind: "profile" | "invite";
  id: string;
  email: string;
  name: string;
  systemRole: "owner" | "admin" | "learner";
  statusKey: LearnerAccessStatusKey;
  statusLabel: string;
  accessLabel: string;
  createdAt: string;
  expiresAt: string | null;
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

export type LearnerAccessInviteInput = {
  id: string;
  email: string;
  system_role: "owner" | "admin" | "learner";
  role_group_ids: string[] | null;
  created_at: string;
  accepted_at: string | null;
  expires_at: string;
};

export function shapeLearnerAccessRows({
  profiles,
  invites,
  userRoleGroupsByUserId,
  now,
}: {
  profiles: LearnerAccessProfileInput[];
  invites: LearnerAccessInviteInput[];
  userRoleGroupsByUserId: Record<string, string[]>;
  now: Date;
}): LearnerAccessRow[] {
  const profileRows = profiles.map((profile) => {
    const roleGroupIds = userRoleGroupsByUserId[profile.id] ?? [];
    const accessLabel =
      roleGroupIds.length > 0 ? "Role group assigned" : "No role group assigned";
    const status = getProfileStatus(profile.status, roleGroupIds);

    return {
      kind: "profile" as const,
      id: profile.id,
      email: profile.email ?? "",
      name: profile.full_name || profile.email || "Unnamed learner",
      systemRole: profile.system_role,
      statusKey: status.key,
      statusLabel: status.label,
      accessLabel,
      createdAt: profile.created_at,
      expiresAt: null,
      roleGroupIds,
    };
  });

  const inviteRows = invites
    .filter((invite) => !invite.accepted_at)
    .map((invite) => {
      const roleGroupIds = invite.role_group_ids ?? [];
      const expired = new Date(invite.expires_at) <= now;

      return {
        kind: "invite" as const,
        id: invite.id,
        email: invite.email,
        name: invite.email,
        systemRole: invite.system_role,
        statusKey: expired ? "expired_invite" as const : "pending_invite" as const,
        statusLabel: expired ? "Expired" : "Pending invite",
        accessLabel:
          roleGroupIds.length > 0
            ? "Role group assigned"
            : "No role group assigned",
        createdAt: invite.created_at,
        expiresAt: invite.expires_at,
        roleGroupIds,
      };
    });

  return [...profileRows, ...inviteRows].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

function getProfileStatus(
  status: LearnerAccessProfileInput["status"],
  roleGroupIds: string[],
): { key: LearnerAccessStatusKey; label: string } {
  if (status === "suspended") {
    return { key: "suspended", label: "Suspended" };
  }
  if (roleGroupIds.length === 0) {
    return { key: "missing_access", label: "Needs access" };
  }
  return { key: "ready", label: "Ready" };
}
