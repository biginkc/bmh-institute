"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  deletionMessage,
  type DeletionEntity,
  type DeletionPreview,
} from "./admin-deletions";

type RpcError = { message: string; code?: string } | null;

export async function previewAdminDeletion(input: {
  entityType: DeletionEntity;
  entityId: string;
}): Promise<DeletionPreview> {
  await requireAdmin();
  const supabase = await createClient();
  const client = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError }> };
  const { data, error } = await client.rpc("fn_admin_preview_deletion_v1", {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
  });
  if (error || !data || typeof data !== "object") {
    if (error) {
      // A missing RPC (undefined_function, 42883) and a permission denial
      // (insufficient_privilege, 42501) both fall through to the same
      // generic client-facing code below, so log the real cause here —
      // don't leave the two indistinguishable server-side.
      console.error("[admin-deletion] preview RPC failed", {
        entityType: input.entityType,
        code: error.code,
        message: error.message,
      });
    }
    return { code: "database_rejected" };
  }
  return data as DeletionPreview;
}

export async function deleteAdminEntity(input: {
  entityType: DeletionEntity;
  entityId: string;
  revalidatePaths: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const client = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError }> };
  const { data, error } = await client.rpc("fn_admin_delete_catalog_entity_v1", {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
  });
  if (error || !data || typeof data !== "object") {
    if (error) {
      console.error("[admin-deletion] delete RPC failed", {
        entityType: input.entityType,
        entityId: input.entityId,
        code: error.code,
        message: error.message,
      });
    }
    // Never surface the raw Postgres message to the client toast — it can
    // leak schema/internal detail. Log it above; show a generic actionable
    // message here instead.
    return { ok: false, error: deletionMessage("database_rejected") };
  }
  const result = data as { code?: Parameters<typeof deletionMessage>[0] };
  if (result.code !== "deleted") return { ok: false, error: deletionMessage(result.code ?? "database_rejected") };
  for (const path of input.revalidatePaths) revalidatePath(path);
  return { ok: true };
}
