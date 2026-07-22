# BMH Institute quiz and Slot 16 guide review

Status: **quizbank and all 19 learner guides approved**.

> Independent quiz approval and course-QA guide acceptance are separate checksum-bound records.

## 1. Quiz pools: approved

[Open the full 920-question quizbank review](./quiz-content-review.quizbank.v1.md)

- Exact request: [quiz-content-review-request.v1.json](./quiz-content-review-request.v1.json)
- Request SHA-256: `c9339772f865747148d8c1814734f271d31f8b4837d80e98f62fe673b585638f`
- Full review SHA-256: `5bc8394c19480a06ca7bcd1374d3c0dcb9eb6097b3439d1b620f1c9c09243816`
- Scope: 19 variable-size pools, 920 questions, all questions randomized per attempt
- Approved by: Claude independent content review
- Approved at: 2026-07-22T13:21:48Z
- Evidence: Independently verified the exact checksum-bound 2026-07-22 content-quality v8 packet: all identities recomputed; pools 1-18 hash-identical to the approved v7 request (authenticated at /tmp/bmh-v7-request.json); slot-19 delta cryptographically proven to be exactly one word (guarantee->establish) in question-r-legacy-ch13-029 explanation via revert-and-rehash reproducing the v7 pool hash; the reworded explanation still teaches no promised outcome; released graph d2b9fc18... reproduced by live derivation (19/920/3,678); quiz-bank QA 6/6; no BLOCKER or MAJOR. Note: released-quiz-revision.test.ts must be repinned to the v8 graph SHA before merge.

| Quiz pool | Questions | SHA-256 | Status |
| --- | ---: | --- | --- |
| `quiz-slot-01` | 51 | `2a348c0c271f734531894d060dfe801f2dc1a6f435595a02b7303015fc3fde29` | approved |
| `quiz-slot-02` | 48 | `6ef8eaa76138102b8b64aca16247b3c74768b10aa461d6fcb0815f53e540afd6` | approved |
| `quiz-slot-03` | 44 | `f78f6f367ff71777f9e2a73843c75a6aa9a82f2e2897b2cda679d3f19d41e8ae` | approved |
| `quiz-slot-04` | 70 | `298f8dc436d303e028fe9d2ac8a9b2319044308d22b06b0852b2707dca4dae83` | approved |
| `quiz-slot-05` | 73 | `f24ac22e4ba450743612b901cc0f618394570a271a3ec2522aa0f879b16af71d` | approved |
| `quiz-slot-06` | 42 | `eb8c21df1e0f281f852b645dc8ac19f8ce552fa10036b6c60799516e24e500e5` | approved |
| `quiz-slot-07` | 39 | `0b2b251cb4bf6a10ec1b274acdb47399f2753293ba37efb78370031134af1e01` | approved |
| `quiz-slot-08` | 32 | `9defcb29a8dc63a3f964748421d92e054ba2c95dc4891eb9b7316cac74b0dcfe` | approved |
| `quiz-slot-09` | 76 | `31a2fbedf0019f5561269d5467d21214cfa9db45324770383e468e6728633d7e` | approved |
| `quiz-slot-10` | 50 | `971f65128b67935edf0b3d98f988b597587158873ae0f7b1b887032d93584a42` | approved |
| `quiz-slot-11` | 59 | `4a6cb0aabac99fe53f52c22a2fdc9be7702882bd5ac37967b61116b12a2980f5` | approved |
| `quiz-slot-12` | 37 | `2f31f8363a95b64977b1e118971a85792f9ab504753d462eada75e4910bbc062` | approved |
| `quiz-slot-13` | 57 | `9d52de98ebbae528bdd1f52a6b3de34f49a6203bba81edd5c0dd5740d48382fb` | approved |
| `quiz-slot-14` | 40 | `178967e13d68fa46e4ac08145796d7007e8d0276030901ceff37f7c863c91340` | approved |
| `quiz-slot-15` | 30 | `c7bd2d87cf7c64c342077b9e50f59b0b4312069e8613736317dbbe65e04e1173` | approved |
| `quiz-slot-16` | 38 | `98d3d92483b9d6a1d0ccb68a2b1d8bb9867603ae780993f701f1e9790e83d5bb` | approved |
| `quiz-slot-17` | 51 | `5b25bbccd3314cfdadf539765030d7328d1b1c906c392b465f9f5df1b762d88d` | approved |
| `quiz-slot-18` | 36 | `78a06155e23ac6808c3b3e324ea67344df65eb5684100f82fdb4ea094cff1f7e` | approved |
| `quiz-slot-19` | 47 | `d96906b18def7a616fbca27a858f68ad914d597f4bb3a93c5ad2784d3370ff7c` | approved |

## 2. Regenerated learner guides: course-QA accepted

[Open the current Slot 16 learner guide sample](../../output/pdf/slot-16-learner-guide.pdf)

- Current SHA-256: `71c9ad3757b135363ec12bdb3538a4aac388124cc30223304714e2bb5d2017ad`
- Current size: 50695 bytes
- Guide ledger: [guide-approvals.json](./guide-approvals.json)
- Ordered guide records SHA-256: `e3a3b8811d71a7f1be8db69621f848e09e3c3f3c4839f773d195aa644a87c91e`
- Guide records: 19
- Accepted by: codex-course-qa-controller
- Accepted at: 2026-07-22T11:25:14Z
- Human approval: false
- Evidence: Course-QA controller reacceptance after the content-quality exhaustive quiz-bank update, deterministic rebuild, full semantic tests, and visual review of all ten changed guide pages; not Jarrad human approval.

The linked sample matches the Slot 16 record in the accepted guide ledger. The ledger acceptance is bound to the exact ordered set of all 19 regenerated guide records.

## What the controller does next

- Quizzes: No quiz approval action remains. Preserve the request and 19 exact approval records as the publication binding.
- Guide: No guide approval action remains. Preserve the complete 19-record guide ledger as the publication binding.
- Neither decision authorizes course import, publication, or employee access.
