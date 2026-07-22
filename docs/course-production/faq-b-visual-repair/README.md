# Seller FAQ Decoder Part B visual-repair review

Status: QA candidate only. Not approved, referenced by the manifest, uploaded, or published.

## Defect

The production-approved `video-slot-12-faq-b` cut has an unstable lower-third between approximately 00:72 and 00:78. The words in the footer visibly flicker and become malformed even though the narration and primary lesson content remain intact.

Original source:

- path: `course-assets/review-lesson9B/LESSON-9B-v3.mp4`
- SHA-256: `b977edbf0438b6cc8c4410e569f6f686fa8f4efbd864828795ac7a89034f919c`
- duration: 180.778 seconds
- size: 75,665,539 bytes

## Candidate repair

The QA candidate replaces only the unstable lower-third region during 00:72-00:78 with the same clean lower-third taken from the adjacent stable frame. The audio stream is copied without transcoding.

- path: `course-assets/review-lesson9B/LESSON-9B-v4-QA-CANDIDATE.mp4`
- SHA-256: `6befa8d8371ee00395b532367a00f0d34ac9adcef0ec919e907ec04ca5c1e613`
- duration: 180.800 seconds
- size: 72,439,818 bytes
- video: H.264, 1600x900, 30 fps
- audio: AAC, 48 kHz, stereo
- original and candidate audio-stream SHA-256: `8ee04e84f8e688a5bd5bc6597c1ab5d6137a0315d878c7c28704ba3f99700a29`
- full decode: passed with no video or audio decode errors

The 22 ms container-duration difference is below one 30 fps frame and does not change the copied audio stream.

## Review stills

The paired frames show the production source and candidate at the same timestamps:

| Timestamp | Production source | QA candidate |
| --- | --- | --- |
| 00:74 | [original-74.jpg](./original-74.jpg) | [candidate-74.jpg](./candidate-74.jpg) |
| 00:75 | [original-75.jpg](./original-75.jpg) | [candidate-75.jpg](./candidate-75.jpg) |
| 00:77 | [original-77.jpg](./original-77.jpg) | [candidate-77.jpg](./candidate-77.jpg) |

## Release boundary

This candidate must not inherit the original cut's video or caption approval. Before publication, its exact checksum requires review, an append-only video decision, caption validation bound to this video checksum, manifest rebuild, staging verification, and authenticated preview playback. The original approved cut remains unchanged and recoverable.
