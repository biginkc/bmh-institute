# BMH Institute quiz and Slot 16 guide review

Status: **quizbank approved; separate Slot 16 guide decision still required**.

> Jarrad's quiz approval is recorded in the checksum-bound ledger. It does not approve the changed Slot 16 guide.

## 1. Quiz pools: approved

[Open the full 920-question quizbank review](./quiz-content-review.quizbank.v1.md)

- Exact request: [quiz-content-review-request.v1.json](./quiz-content-review-request.v1.json)
- Request SHA-256: `8a399e9c85266f78f3564d27b1833176e3ce828c37061fc2d498f271add02639`
- Full review SHA-256: `b2a99497dd6e154befaf157524ce9728aa4ed4de4f765ada2541d9d597c2d1d9`
- Scope: 19 variable-size pools, 920 questions, all questions randomized per attempt
- Approved by: Jarrad Henry
- Approved at: 2026-07-20T21:05:00Z
- Evidence: Reviewed docs/course-production/quiz-content-review.quizbank.v1.md; approval given in Claude session 2026-07-20

| Quiz pool | Questions | SHA-256 | Status |
| --- | ---: | --- | --- |
| `quiz-slot-01` | 51 | `e2cbefd1df13d7c57d69e2daf3b8e0fe2569a8f0f99a059e0f3b70bcb247519e` | approved |
| `quiz-slot-02` | 48 | `6ef8eaa76138102b8b64aca16247b3c74768b10aa461d6fcb0815f53e540afd6` | approved |
| `quiz-slot-03` | 44 | `f78f6f367ff71777f9e2a73843c75a6aa9a82f2e2897b2cda679d3f19d41e8ae` | approved |
| `quiz-slot-04` | 70 | `e309cbc93304e58a2733436a19807e16660997bb1f6a49e14a24689d0c599313` | approved |
| `quiz-slot-05` | 73 | `f10154a2cadbb999a007d8901d0c4b44b67058a39ea864679db81ed738d63b98` | approved |
| `quiz-slot-06` | 42 | `b0fe8d2c9aea0a97c6296b507905e93b6258779d17156b0fecf31bf28ac4e74e` | approved |
| `quiz-slot-07` | 39 | `62da1ee54359184d012152908b826ab7c89710607c92f2e65284550bbd455c4b` | approved |
| `quiz-slot-08` | 32 | `9defcb29a8dc63a3f964748421d92e054ba2c95dc4891eb9b7316cac74b0dcfe` | approved |
| `quiz-slot-09` | 76 | `11e93d705f23ade0ac958019a5f20a3f9d7e848dd20b28c5f51ce8810a0f0626` | approved |
| `quiz-slot-10` | 50 | `60411b79b40a7c240116cbf803a9e9464fb991d48372adb18ec6423f1a8efe57` | approved |
| `quiz-slot-11` | 59 | `4a6cb0aabac99fe53f52c22a2fdc9be7702882bd5ac37967b61116b12a2980f5` | approved |
| `quiz-slot-12` | 37 | `2f31f8363a95b64977b1e118971a85792f9ab504753d462eada75e4910bbc062` | approved |
| `quiz-slot-13` | 57 | `300dabc961c9aa27671b4b0ee79314320c02adb442e58b95ff4159c3654c11a0` | approved |
| `quiz-slot-14` | 40 | `178967e13d68fa46e4ac08145796d7007e8d0276030901ceff37f7c863c91340` | approved |
| `quiz-slot-15` | 30 | `01de5ec47774db205c391f0391fb487fe1ccacf05d6263fb791cdc1231e3b40b` | approved |
| `quiz-slot-16` | 38 | `b3b7ea9348829ef87700073f04d23749057fabfdf9ef8851ab6f978a24a79259` | approved |
| `quiz-slot-17` | 51 | `2aafd9a9521386cfb19ad476382558df8172a5574b37734d59a2be7149aacdd2` | approved |
| `quiz-slot-18` | 36 | `21b86b46ff63e3be37d4e16c88e1e1aaed96973f4442fb9e61042ca2dc848e4d` | approved |
| `quiz-slot-19` | 47 | `0f52e746349e5b7a8ca8087a57ec284296004c69a5a5003d258b5c871b82ad89` | approved |

## 2. Changed Slot 16 learner guide

[Open the current Slot 16 learner guide](../../output/pdf/slot-16-learner-guide.pdf)

- Current SHA-256: `1ea291e1190ba6f990407cff53160ef90c1acf787e5e66ed6686a2d9984d7c5d`
- Current size: 50676 bytes
- Superseded course-QA record SHA-256: `52fba6bfab15ec9b91cf5814b0ab2a04d03189387f96574056852fb778aeaae6`
- Superseded size: 50633 bytes

The current PDF differs from the accepted course-QA record. Human approval permits the controller to perform reacceptance checks; it does not itself rewrite the guide ledger.

**Question:** Do you approve the changed Slot 16 learner guide for course-QA reacceptance?

If approved, respond exactly:

> Approved guide: I reviewed the current Slot 16 learner guide bound to SHA-256 1ea291e1190ba6f990407cff53160ef90c1acf787e5e66ed6686a2d9984d7c5d and size 50676 bytes for course-QA reacceptance.

## What the controller does next

- Quizzes: No quiz approval action remains. Preserve the request and 19 exact approval records as the publication binding.
- Guide: After preserving the exact human response, rerun deterministic rebuild, semantic tests, and visual review; then rebuild and reaccept the complete 19-guide ledger. The response alone does not reaccept the guide.
- Neither decision authorizes course import, publication, or employee access.
