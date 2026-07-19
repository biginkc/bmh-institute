import { describe, expect, it } from "vitest";

import {
  filterAssignableRoleGroups,
  unreleasedImportQaRoleGroupIds,
} from "./qa-role-groups";

describe("unreleased imported QA role groups", () => {
  it("identifies the sole access group for each unpublished imported program", () => {
    expect(
      unreleasedImportQaRoleGroupIds([
        {
          content_import_id: "bmh-review-v1",
          is_published: false,
          program_access: [{ role_group_id: "qa-group" }],
        },
        {
          content_import_id: null,
          is_published: false,
          program_access: [{ role_group_id: "ordinary-draft-group" }],
        },
        {
          content_import_id: "released-v1",
          is_published: true,
          program_access: [{ role_group_id: "employee-group" }],
        },
      ]),
    ).toEqual(new Set(["qa-group"]));
  });

  it("fails closed by hiding every access group if an unreleased import is malformed", () => {
    expect(
      unreleasedImportQaRoleGroupIds([
        {
          content_import_id: "bmh-review-v1",
          is_published: false,
          program_access: [
            { role_group_id: "qa-group" },
            { role_group_id: "unexpected-group" },
          ],
        },
      ]),
    ).toEqual(new Set(["qa-group", "unexpected-group"]));
  });

  it("removes protected groups from generic assignment selectors", () => {
    expect(
      filterAssignableRoleGroups(
        [
          { id: "employee-group", name: "Employees" },
          { id: "qa-group", name: "Imported review QA" },
        ],
        new Set(["qa-group"]),
      ),
    ).toEqual([{ id: "employee-group", name: "Employees" }]);
  });
});
