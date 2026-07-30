"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  deletionMessage,
  type DeletionEntity,
  type DeletionPreview,
} from "./admin-deletions";

export async function previewAdminDeletion(input: {
  entityType: DeletionEntity;
  entityId: string;
}): Promise<DeletionPreview> {
  await requireAdmin();
  const supabase = await createClient();
  const client = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await client.rpc("fn_admin_preview_deletion_v1", {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
  });
  if (error || !data || typeof data !== "object") return { code: "database_rejected" };
  return data as DeletionPreview;
}

export async function deleteAdminEntity(input: {
  entityType: DeletionEntity;
  entityId: string;
  revalidatePaths: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const client = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await client.rpc("fn_admin_delete_catalog_entity_v1", {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
  });
  if (error || !data || typeof data !== "object") {
    return { ok: false, error: error?.message ?? deletionMessage("database_rejected") };
  }
  const result = data as { code?: Parameters<typeof deletionMessage>[0] };
  if (result.code !== "deleted") return { ok: false, error: deletionMessage(result.code ?? "database_rejected") };
  for (const path of input.revalidatePaths) revalidatePath(path);
  return { ok: true };
}
