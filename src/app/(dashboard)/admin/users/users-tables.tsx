"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

import { Badge, Table, type BadgeProps } from "@/components/bmh-ds";
import type {
  PilotCohortRow,
  PilotStatusKey,
} from "@/lib/pilot-cohort/status";

import { ResendInviteButton } from "./resend-invite-button";
import { RevokeInviteButton } from "./revoke-invite-button";

type ProfileRow = {
  id: string;
  email: string;
  fullName: string;
  systemRole: string;
  status: string;
};

type InviteRow = {
  id: string;
  email: string;
  systemRole: string;
  expiresAt: string;
};

export function PilotSetupTable({ rows }: { rows: PilotCohortRow[] }) {
  return (
    <div data-testid="learner-access-table-scroll" style={{ width: "100%", overflowX: "auto" }}>
      <div style={{ minWidth: "52rem" }}>
      <Table
      rowKey="id"
      columns={[
        { key: "name", label: "Person" },
        { key: "email", label: "Email" },
        { key: "statusLabel", label: "Setup status" },
        { key: "accessLabel", label: "Access" },
        { key: "action", label: "Action", align: "right" },
      ]}
      rows={rows}
      empty="No learners yet. Send the first invite when the learning group is ready."
      cell={{
        email: (row) => muted(row.email),
        statusLabel: (row) => (
          <Badge tone={pilotTone(row.statusKey)} size="sm">
            {row.statusLabel}
          </Badge>
        ),
        accessLabel: (row) => muted(row.accessLabel),
        action: (row) =>
          row.kind === "profile" ? (
            <Link href={`/admin/users/${row.id}/edit`} style={actionLinkStyle}>
              Review access
            </Link>
          ) : (
            <InviteActions inviteId={row.id} />
          ),
      }}
      />
      </div>
    </div>
  );
}

export function ActiveMembersTable({ rows }: { rows: ProfileRow[] }) {
  return (
    <div data-testid="active-members-table-scroll" style={{ width: "100%", overflowX: "auto" }}>
      <div style={{ minWidth: "46rem" }}>
      <Table
      rowKey="id"
      columns={[
        { key: "fullName", label: "Name" },
        { key: "email", label: "Email" },
        { key: "systemRole", label: "Role" },
        { key: "status", label: "Status", align: "right" },
      ]}
      rows={rows}
      empty="No members yet."
      cell={{
        fullName: (row) => (
          <Link href={`/admin/users/${row.id}/edit`} style={actionLinkStyle}>
            {row.fullName}
          </Link>
        ),
        email: (row) => muted(row.email),
        systemRole: (row) => (
          <Badge tone={roleTone(row.systemRole)} size="sm">
            {titleize(row.systemRole)}
          </Badge>
        ),
        status: (row) => (
          <Badge tone={statusTone(row.status)} size="sm">
            {titleize(row.status)}
          </Badge>
        ),
      }}
      />
      </div>
    </div>
  );
}

export function PendingInvitesTable({ rows }: { rows: InviteRow[] }) {
  return (
    <div data-testid="pending-invites-table-scroll" style={{ width: "100%", overflowX: "auto" }}>
      <div style={{ minWidth: "48rem" }}>
      <Table
      rowKey="id"
      columns={[
        { key: "email", label: "Email" },
        { key: "systemRole", label: "Role" },
        { key: "expiresAt", label: "Expires" },
        { key: "action", label: "Action", align: "right" },
      ]}
      rows={rows}
      empty="No pending invites."
      cell={{
        systemRole: (row) => titleize(row.systemRole),
        expiresAt: (row) => {
          const expires = new Date(row.expiresAt);
          return expires <= new Date() ? (
            <Badge tone="red" size="sm">Expired</Badge>
          ) : (
            muted(`in ${formatDistanceToNow(expires)}`)
          );
        },
        action: (row) => <InviteActions inviteId={row.id} />,
      }}
      />
      </div>
    </div>
  );
}

function InviteActions({ inviteId }: { inviteId: string }) {
  return (
    <span style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <ResendInviteButton inviteId={inviteId} />
      <RevokeInviteButton inviteId={inviteId} />
    </span>
  );
}

function muted(value: string) {
  return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{value}</span>;
}

function pilotTone(status: PilotStatusKey): BadgeProps["tone"] {
  if (status === "expired_invite" || status === "suspended") return "red";
  if (status === "missing_access") return "yellow";
  if (status === "ready") return "green";
  return "blue";
}

function roleTone(role: string): BadgeProps["tone"] {
  if (role === "owner") return "solid";
  if (role === "admin") return "blue";
  return "neutral";
}

function statusTone(status: string): BadgeProps["tone"] {
  if (status === "active") return "green";
  if (status === "suspended") return "red";
  return "yellow";
}

function titleize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

const actionLinkStyle = {
  color: "var(--action)",
  fontSize: 13,
  fontWeight: 800,
  textDecoration: "none",
};
