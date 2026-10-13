# Simoura FDI Tooth Reference Library — v1 scaffold

## What's included
- `teeth.json`: 32 permanent-tooth records using FDI two-digit numbering (11–18, 21–28, 31–38, 41–48).
- `reference-library.js`: dependency-free CommonJS retrieval and prompt-guidance helper.
- `assets/<FDI>/`: placeholder folders for licensed, standardized reference images.

## Important status
This is a **database scaffold**, not a populated clinical reference database. No anatomical images, measured landmarks, validated dimensions, or clinical claims are included. Image paths intentionally point to files that must be sourced and reviewed before use.

## Suggested asset views
- `labial.png`: frontal/labial crown view
- `incisal_occlusal.png`: incisal view for incisors/canines or occlusal view for posterior teeth
- `mesial.png` and `distal.png`: proximal views where available

Use consistent orientation and document source, license, view, and any image processing. Do not mix diagrams, extracted patient photos, and isolated tooth renders without recording the asset type.

## Integrating into the existing Node.js backend
1. Copy this folder into the backend project, e.g. `data/fdi-tooth-library/`.
2. Require `reference-library.js` from the existing `server.js`.
3. In `/api/tooth-visualize`, after validating the selected FDI number, call `getToothReference(fdi)`.
4. If `hasUsableReferenceImage` is true, include the selected tooth's best-matching reference image in the image-editing request **only if the configured image API supports multiple image inputs**. Otherwise create a clearly labelled reference canvas or use an API-supported multi-image format.
5. Append `buildReferenceGuidance(tooth, customPrompt)` to the image-editing prompt.
6. Keep the current crop → edit → feathered composite workflow. The reference should guide morphology; it must not replace the patient's crop or be pasted into the result.
7. Log the reference asset ID/version used for each generation so results are reproducible.

## Before using real assets
- Confirm redistribution and commercial-use rights.
- Prefer one source and consistent view/orientation for the initial pilot.
- Have a qualified dental professional review anatomy and any landmark annotations.
- Keep unknown measurements as `null`; do not invent normalized landmarks or width/height ratios.
- Treat this as a visual simulation aid, not a diagnostic or treatment-planning authority.

## Smoke test
Run from this directory:
```bash
node -e "const lib=require('./reference-library'); console.log(lib.loadDatabase().teeth.length, lib.getToothReference('11').tooth_type)"
```
Expected output starts with: `32 central_incisor`
