---
status: complete
created: 2026-05-09
scope: ui
---

# Stitch Shell Parity

Goal: close implementation drift between the BMH Institute dashboard shell and the saved BMH Stitch screens.

## Findings

- Saved Stitch screens show LEARN and ADMIN sidebar labels.
- Saved Stitch screens use a larger rounded-square brand mark.
- Saved Stitch screens include a notification icon in the topbar.
- Role pill should reflect owner/admin/learner in uppercase.
- Profile access belongs in the topbar identity area rather than as a learner sidebar item.

## Plan

1. Update shell tests to assert the Stitch-visible labels and topbar details.
2. Update BrandLockup mark sizing to match the saved screens.
3. Update DashboardLayout topbar notification and role pill rendering.
4. Update SidebarNav to restore LEARN and ADMIN section labels and keep the learner rail focused on Dashboard and Certificates.
5. Run targeted RTL tests and the full verify gate.
