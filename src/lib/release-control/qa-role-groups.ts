export type RoleGroupOption = { id: string; name: string };

type ImportedProgramAccessRow = {
  content_import_id: string | null;
  is_published: boolean;
  program_access:
    | Array<{ role_group_id: string | null }>
    | { role_group_id: string | null }
    | null;
};

export function unreleasedImportQaRoleGroupIds(
  programs: ImportedProgramAccessRow[],
): Set<string> {
  const restricted = new Set<string>();

  for (const program of programs) {
    if (!program.content_import_id || program.is_published) continue;
    const accessRows = Array.isArray(program.program_access)
      ? program.program_access
      : program.program_access
        ? [program.program_access]
        : [];
    for (const access of accessRows) {
      if (access.role_group_id) restricted.add(access.role_group_id);
    }
  }

  return restricted;
}

export function filterAssignableRoleGroups<T extends RoleGroupOption>(
  roleGroups: T[],
  restrictedIds: ReadonlySet<string>,
): T[] {
  return roleGroups.filter((roleGroup) => !restrictedIds.has(roleGroup.id));
}
