---
status: in-progress
created: 2026-05-09
branch: codex/20260509-fix-owned-domain
---

# Fix owned domain references

Goal: correct BMH Institute domain assumptions from `bmhgroup.com` to the owned `bmhgroupkc.com` domain.

Scope:

- Update default admin email and tests to use `jarrad@bmhgroupkc.com`.
- Update Server Action allowed origins to include `institute.bmhgroupkc.com`.
- Update environment examples and production-readiness tracker to point at `institute.bmhgroupkc.com`.
- Update AGENTS.md stack notes so future agents stop using the unowned domain.

Out of scope:

- Editing untracked Sandra Practice planning files.
- Changing Cloudflare DNS.
- Changing production secrets.
