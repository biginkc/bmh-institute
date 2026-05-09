---
phase: 6
slug: pilot-cohort-setup
status: approved
shadcn_initialized: true
preset: base-nova
created: 2026-05-09
---

# Phase 6 - UI Design Contract

> Visual and interaction contract for Pilot Cohort Setup. Generated for the BMH Institute admin workflow and verified against the current app shell.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn |
| Preset | base-nova |
| Component library | Base UI through shadcn primitives |
| Icon library | lucide-react |
| Font | Geist Sans and Geist Mono |
| Tokens | `@sandra/tokens/theme.css` imported by `src/app/globals.css` |

---

## Screen Contract

Phase 6 should extend the existing `/admin/users` and `/admin/users/[userId]/edit` workflow. It must keep the shared fixed top nav, left nav, `BrandLockup`, `PageHeader`, and admin shell behavior from Phase 5.

Primary admin surface:

- Keep `PageHeader` at the top with breadcrumb `Admin / Users`.
- Preserve the current two-column desktop composition where the main member or cohort state gets the wider column and setup actions sit in the narrower column.
- Use dense tables, compact status badges, filters, and action rows. Do not introduce a landing page, hero, decorative cards, or explanatory marketing sections.
- Use a single page-level operations surface. Do not put cards inside cards.
- Mobile should stack sections in source order and keep all actions reachable without horizontal scrolling except data tables that already have explicit min widths.

---

## Spacing Scale

Declared values must follow the existing Tailwind spacing scale:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, badge internals |
| sm | 8px | Button gaps, compact row controls |
| md | 16px | Card internals and filter rows |
| lg | 24px | Section gaps and mobile page padding |
| xl | 32px | Desktop page padding |
| 2xl | 48px | Only for major vertical breaks if needed |

Exceptions: none.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px | 400 | 1.5 |
| Label | 12px | 600 | 1.35 |
| Table header | 12px | 600 | 1.35 |
| Card title | 16px | 600 | 1.35 |
| Page title | 24px | 700 | 1.2 |

Do not use hero-scale type inside the admin surface. Letter spacing remains 0 except existing uppercase breadcrumb and pill patterns.

---

## Color

Use existing CSS variables and Sandra tokens only.

| Role | Value | Usage |
|------|-------|-------|
| Dominant | `bg-background`, `text-foreground` | Page background and primary text |
| Surface | `bg-card`, `border-border` | Cards, tables, attention blocks |
| Muted | `text-muted-foreground`, `bg-muted` | Secondary labels, empty states, inactive pills |
| Accent | `bg-primary`, `text-primary-foreground` | Primary action only |
| Warning | existing amber utility pattern from `src/app/(dashboard)/admin/page.tsx` | Expired invites and urgent attention |
| Destructive | `text-destructive`, destructive badge/button variants | Revoke, delete, irreversible action warnings |

Accent is reserved for primary pilot setup actions and current active state. Do not recolor every interactive element.

---

## Components

Use existing components first:

- `PageHeader` for page title, breadcrumb, and optional right-side actions.
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` for top-level panels only.
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` for learner, invite, and access state lists.
- `Badge` for status states: active, invited, pending, expired, suspended, missing access.
- `Button` for clear commands. Use lucide icons inside buttons where the action benefits from quick scanning.
- Existing `InviteForm`, `ResendInviteButton`, `RevokeInviteButton`, and `UserEditForm` should be reused or lightly extended.

Do not add third-party registry blocks.

---

## Interaction Contract

Status states:

- Active learner with access: neutral or success badge.
- Invited and not expired: secondary badge plus expiry text.
- Expired invite: destructive or amber warning badge with resend and revoke actions visible.
- Missing role group: warning state with link to edit user or role groups.
- Suspended: secondary badge, not destructive unless paired with delete.

Actions:

- Primary setup action copy should be specific, for example `Send invite`, `Resend invite`, `Save access`, or `Review access`.
- Destructive actions must keep confirmation behavior where data loss is possible.
- Access correction should route through the existing edit user flow unless the implementation creates an equally safe inline path with the same server action protections.

Empty states:

- No members: `No learners yet. Send the first pilot invite when the cohort is ready.`
- No pending invites: `No pending invites.`
- No role groups: `No role groups defined. Create role groups before inviting pilot learners.`

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Page title | Users |
| Page description | Pilot learner access, invite status, and role groups. |
| Primary CTA | Send invite |
| Empty members | No learners yet. Send the first pilot invite when the cohort is ready. |
| Empty invites | No pending invites. |
| Missing access | No role group assigned |
| Expired invite | Expired |
| Error state | The action could not be completed. Try again or check the learner's invite status. |
| Destructive confirmation | Permanently delete this user? They will be removed from auth and all progress, certificates, and role assignments will be deleted. This cannot be undone. |

Learner-facing copy introduced indirectly by this phase must be plain, short, and suitable for async VA training where English may be a second language.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Button, Badge, Card, Table, Label | Existing local components only |
| third-party | none | Not allowed in this phase |

---

## Browser Verification Contract

Verification must include:

- Desktop `/admin/users` at 1440px width.
- Mobile `/admin/users` around 390px width.
- At least one pending invite state and one expired or missing-access state, using disposable test data where writes are needed.
- No overlapping text, clipped buttons, nested card surfaces, or hidden required actions.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

Approval: approved 2026-05-09
