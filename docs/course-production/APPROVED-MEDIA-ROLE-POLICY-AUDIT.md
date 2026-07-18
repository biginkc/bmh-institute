# Approved media named-role policy audit

Date: 2026-07-18

## Outcome

The 22 exact video cuts and their caption/transcript pairs retain their current
approval state. A normalized spoken-prose scan found nine approved bindings
that use named internal roles covered by the reusable-course policy. Each is a
publication blocker until either:

1. a role-agnostic replacement cut and derivative pair receives its own exact
   approval, or
2. Jarrad approves a separate checksum-bound policy exception for the exact
   video, caption, transcript, and detected phrase set.

No exception currently exists. The machine-readable review evidence is
`approved-media-role-policy-review.json`; the deliberately empty exception
boundary is `approved-media-role-policy-exceptions.json`.

This audit does not revoke an exact-cut approval, edit media, regenerate
captions, call a provider, or alter the existing seven held-video records.
In particular, KPI v12 remains an approved exact cut while its role-policy
exception is pending.

## Exact pending bindings

| Video asset | Detected named-role phrases |
|---|---|
| `video-slot-03-tech-stack` | `team lead` |
| `video-slot-06-framework` | `acquisition team` |
| `video-slot-06-pipeline` | `acquisition manager`; `acquisition team`; `transaction team`; `transaction teams` |
| `video-slot-08-discovery` | `acquisition team` |
| `video-slot-08-handoff` | `acquisition manager`; `acquisition team`; `acquisitions team` |
| `video-slot-11-complex` | `acquisition team` |
| `video-slot-12-faq-b` | `acquisition team`; `transaction team` |
| `video-slot-16-kpis` | `acquisition team` |
| `video-slot-18-mission-control` | `acquisition team` |

The review ledger binds every row to all three SHA-256 values. Phrase matching
runs after whitespace normalization, so a VTT line wrap such as
`acquisition\nteam` cannot evade the gate. `transaction team` and
`transaction teams` are explicitly included. Product identity such as
`Closer Lab` is not treated as a role-title hit.

## Release accounting

- Manifest asset state remains 22 approved videos and seven held videos.
- Nine of the 22 approved videos now carry an independent publication blocker.
- With no approved exceptions, only 13 approved cuts are policy-clear.
- The effective release queue is therefore seven held replacements plus nine
  approved-cut policy decisions: 16 unresolved video-policy gates.

The distinction is deliberate: exact-cut approval answers whether Jarrad
approved those bytes; the new policy gate answers whether those approved bytes
are reusable across roles.

## Verification

Run:

```sh
node --test content/course-manifests/approved-video-captions.qa.test.mjs
node --test content/course-manifests/bmh-import-semantic-gate.qa.test.mjs
npm run test:course-content
```
