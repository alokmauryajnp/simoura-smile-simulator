require("dotenv").config();

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================================
// FILE UPLOAD CONFIGURATION
// ============================================================

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

app.use(express.json({ limit: "5mb" }));

// Serve frontend
app.use(express.static("public"));

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Smile Simulator API is running",
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// KIMI K3 ANALYSIS
// ============================================================

async function analyzeSmile(imageBuffer, mimeType) {

    const base64Image =
        imageBuffer.toString("base64");

    const imageDataUrl =
        `data:${mimeType};base64,${base64Image}`;

    const prompt = `
Analyze this smile photograph for a dental aesthetic visualization.

Look ONLY at what is visibly present in the image.

Determine:

1. Are the teeth sufficiently visible for a smile visualization?
2. Is the image reasonably clear?
3. Is the smile reasonably front-facing?
4. What visible alignment characteristics are present?
5. Is there visible crowding or rotation?
6. What is the approximate visible tooth shade?
7. What is the visible smile arc?
8. How much gum is visible?
9. What visible tooth proportion characteristics are present?
10. What cosmetic changes could realistically be visualized?

Do NOT diagnose disease.

Do NOT invent hidden dental problems.

Do NOT reject the image merely because teeth are uneven, crowded, rotated, discolored, or imperfect.

If the teeth are sufficiently visible, the image should normally be considered suitable for visualization.

Return ONLY valid JSON.

Use exactly this structure:

{
  "visualization_ready": true,
  "image_quality": {
    "teeth_visible": true,
    "clarity": "clear",
    "lighting": "adequate",
    "mouth_visibility": "good",
    "view_angle": "front-facing",
    "blocking_reasons": []
  },
  "summary": "short summary",
  "observations": [
    "observation 1",
    "observation 2",
    "observation 3"
  ],
  "treatment_options": [
    {
      "name": "Alignment",
      "reason": "reason based only on visible teeth",
      "visualize": true
    }
  ],
  "smile_characteristics": {
    "alignment": "description",
    "crowding": "description",
    "tooth_shade": "description",
    "smile_arc": "description",
    "gum_display": "description",
    "tooth_proportions": "description"
  },
  "visualization_plan": {
    "alignment": true,
    "whitening": true,
    "veneers": false,
    "enamel_recontouring": false,
    "gum_modification": false
  },
  "image_edit_instructions": "short realistic dental visualization instructions"
}

Important:

- visualization_ready should be TRUE when the visible teeth can reasonably be edited.
- Only set visualization_ready to FALSE when the teeth cannot reasonably be evaluated.
- Do not use normal dental imperfections as blocking reasons.
- blocking_reasons must remain [] unless there is a genuine image-quality problem.
`;

    console.log(
        "Sending image to Kimi K3..."
    );

    const response =
        await axios.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            {
                model: "moonshotai/kimi-k3",

                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: prompt
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageDataUrl
                                }
                            }
                        ]
                    }
                ],

                /*
                 * Use low reasoning for this task.
                 *
                 * We do not need Kimi to perform a long
                 * reasoning chain. We need structured visual
                 * extraction.
                 */
                reasoning_effort: "low",

                temperature: 1,

                max_tokens: 8192,

                /*
                 * NVIDIA's current Kimi K3 example
                 * uses streaming.
                 */
                stream: true
            },
            {
                headers: {
                    Authorization:
                        `Bearer ${process.env.NVIDIA_API_KEY}`,

                    Accept:
                        "text/event-stream",

                    "Content-Type":
                        "application/json"
                },

                responseType: "text",

                timeout: 300000
            }
        );

    console.log(
        "Kimi HTTP status:",
        response.status
    );

    const raw =
        response.data;

    console.log(
        "Kimi raw response length:",
        raw?.length
    );

    /*
     * --------------------------------------------------------
     * PARSE NVIDIA STREAM
     * --------------------------------------------------------
     */

    let finalContent = "";

    const lines =
        String(raw || "")
            .split("\n");

    for (
        const line of lines
    ) {

        const trimmed =
            line.trim();

        if (
            !trimmed ||
            !trimmed.startsWith("data:")
        ) {
            continue;
        }

        const data =
            trimmed.substring(5).trim();

        if (
            data === "[DONE]"
        ) {
            continue;
        }

        try {

            const parsed =
                JSON.parse(data);

            const delta =
                parsed?.choices?.[0]?.delta;

            /*
             * Kimi's final answer
             */
            if (
                delta?.content
            ) {

                finalContent +=
                    delta.content;

            }

        } catch (error) {

            // Ignore malformed/non-JSON stream lines

        }
    }

    console.log(
        "Kimi final content:",
        finalContent
    );

    /*
     * --------------------------------------------------------
     * SAFETY FALLBACK
     * --------------------------------------------------------
     */

    if (
        !finalContent.trim()
    ) {

        throw new Error(
            "Kimi K3 returned no final answer. The model produced reasoning but no text output."
        );

    }

    return finalContent.trim();
}

// ============================================================
// KIMI REPORT PARSER
// ============================================================

function parseKimiReport(rawReport) {
    if (!rawReport) {
        throw new Error(
            "Kimi returned an empty report."
        );
    }

    let cleaned =
        String(rawReport)
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

    // Direct JSON
    try {
        return JSON.parse(cleaned);
    } catch (error) {
        // Continue to extraction below
    }

    // Extract JSON object
    const start =
        cleaned.indexOf("{");

    const end =
        cleaned.lastIndexOf("}");

    if (
        start !== -1 &&
        end > start
    ) {
        try {
            return JSON.parse(
                cleaned.slice(
                    start,
                    end + 1
                )
            );
        } catch (error) {
            console.error(
                "Kimi JSON parse failed:",
                error.message
            );
        }
    }

    throw new Error(
        "Kimi returned an invalid analysis format."
    );
}

// ============================================================
// IMAGE SUITABILITY CHECK
// ============================================================
//
// IMPORTANT:
// Only explicit Kimi quality flags can block generation.
//
// We DO NOT scan normal observations for words such as
// "uneven", "irregular", "partial", etc.
//
// ============================================================

function isVisualizationAllowed(report) {

    // Explicit Kimi decision
    if (
        report?.visualization_ready === false
    ) {
        return false;
    }

    const quality =
        report?.image_quality || {};

    // Teeth explicitly not visible
    if (
        quality.teeth_visible === false
    ) {
        return false;
    }

    // Explicit unusable flag
    if (
        quality.usable_for_visualization === false
    ) {
        return false;
    }

    // Explicit blocking reasons
    if (
        Array.isArray(
            quality.blocking_reasons
        ) &&
        quality.blocking_reasons.length > 0
    ) {
        return false;
    }

    return true;
}

// ============================================================
// GET BLOCKING REASONS
// ============================================================

function getBlockingReasons(report) {

    const reasons = [];

    const quality =
        report?.image_quality || {};

    // Kimi-provided blocking reasons
    if (
        Array.isArray(
            quality.blocking_reasons
        )
    ) {
        reasons.push(
            ...quality.blocking_reasons
                .map(String)
                .filter(Boolean)
        );
    }

    // Teeth visibility
    if (
        quality.teeth_visible === false
    ) {
        reasons.push(
            "Teeth are not clearly visible."
        );
    }

    // Explicit unusable flag
    if (
        quality.usable_for_visualization === false &&
        reasons.length === 0
    ) {
        reasons.push(
            "The photograph does not provide enough clear dental detail for visualization."
        );
    }

    // Explicit Kimi false decision
    if (
        report?.visualization_ready === false &&
        reasons.length === 0
    ) {
        reasons.push(
            "The photograph was not considered suitable for visualization."
        );
    }

    return [
        ...new Set(reasons)
    ].slice(0, 4);
}

// ============================================================
// NORMALIZE REPORT
// ============================================================

function normalizeReport(report = {}) {

    const normalized = {

        visualization_ready:
            report.visualization_ready !== false,

        image_quality: {

            teeth_visible: true,

            clarity: "clear",

            lighting: "adequate",

            mouth_visibility: "good",

            view_angle: "front-facing",

            blocking_reasons: [],

            ...(report.image_quality || {})
        },

        summary:
            report.summary ||
            "No summary available.",

        observations:
            Array.isArray(
                report.observations
            )
                ? report.observations.map(String)
                : [],

        treatment_options:
            Array.isArray(
                report.treatment_options
            )
                ? report.treatment_options
                : [],

        smile_characteristics: {

            alignment:
                "Not clearly visible",

            crowding:
                "Not clearly visible",

            tooth_shade:
                "Not clearly visible",

            smile_arc:
                "Not clearly visible",

            gum_display:
                "Not clearly visible",

            tooth_proportions:
                "Not clearly visible",

            ...(report.smile_characteristics || {})
        },

        visualization_plan: {

            alignment: false,

            whitening: false,

            veneers: false,

            enamel_recontouring: false,

            gum_modification: false,

            ...(report.visualization_plan || {})
        },

        image_edit_instructions:
            report.image_edit_instructions || ""
    };

    // Server-side validation
    normalized.visualization_ready =
        isVisualizationAllowed(
            normalized
        );

    return normalized;
}

// ============================================================
// POLLINATIONS IMAGE PROMPT
// ============================================================

function buildImagePrompt(report) {

    return `
Create a photorealistic dental-aesthetic visualization from the supplied smile photograph.

IMPORTANT:

- Use the supplied photograph as the exact visual reference.
- Preserve the same person.
- Preserve facial identity.
- Preserve skin.
- Preserve lips.
- Preserve nose.
- Preserve jaw.
- Preserve facial proportions.
- Preserve lighting.
- Preserve camera angle.
- Preserve framing.
- Preserve background.
- Preserve natural facial expression.
- Do not create a new person.
- Do not modify facial identity.
- Do not modify facial structure.
- Do not modify the lips.
- Do not modify the nose.
- Do not modify the skin.
- Do not modify the background.

Restrict all visual changes to the visible teeth and their immediate smile appearance.

------------------------------------------------------------
DENTAL VISUALIZATION PLAN
------------------------------------------------------------

${JSON.stringify(
    report.visualization_plan || {},
    null,
    2
)}

------------------------------------------------------------
VISIBLE SMILE CHARACTERISTICS
------------------------------------------------------------

${JSON.stringify(
    report.smile_characteristics || {},
    null,
    2
)}

------------------------------------------------------------
TREATMENT VISUALIZATION CATEGORIES
------------------------------------------------------------

${JSON.stringify(
    report.treatment_options || [],
    null,
    2
)}

------------------------------------------------------------
ADDITIONAL DENTAL INSTRUCTIONS
------------------------------------------------------------

${
    report.image_edit_instructions ||
    "Create a subtle, natural dental-aesthetic improvement while preserving the original photograph."
}

------------------------------------------------------------
REALISM REQUIREMENTS
------------------------------------------------------------

The result must look like the same original photograph after realistic cosmetic dental treatment.

Keep the result subtle and natural.

Use:

- natural tooth proportions
- natural tooth translucency
- realistic enamel texture
- realistic contact points
- realistic tooth spacing
- natural gum contours
- moderate natural tooth brightness
- realistic tooth anatomy
- natural incisal edges

Avoid:

- exaggerated whitening
- oversized teeth
- unnaturally square teeth
- fake-looking veneers
- perfectly identical teeth
- artificial symmetry
- plastic-looking enamel
- cartoon appearance
- face modification
- skin modification
- lip modification
- jaw modification

Only modify the visible dental area.

This is a visual dental treatment simulation, not a diagnosis.

Generate ONLY the edited photograph.
`;
}

// ============================================================
// POLLINATIONS IMAGE GENERATION
// ============================================================

async function generateSmile(
    imageBuffer,
    mimeType,
    prompt
) {

    const form =
        new FormData();

    form.append(
        "image",
        imageBuffer,
        {
            filename: "smile.png",
            contentType: mimeType
        }
    );

    form.append(
        "prompt",
        prompt
    );

    form.append(
        "model",
        "microsoft/mai-image-2.6"
    );

    const response =
        await axios.post(
            "https://gen.pollinations.ai/v1/images/edits",
            form,
            {
                headers: {
                    ...form.getHeaders(),

                    Authorization:
                        `Bearer ${process.env.POLLINATIONS_API_KEY}`
                },

                responseType: "json",

                maxContentLength:
                    Infinity,

                maxBodyLength:
                    Infinity,

                timeout: 300000
            }
        );

    return response.data;
}

// ============================================================
// EXTRACT GENERATED IMAGE
// ============================================================

function extractGeneratedImage(
    imageResult
) {

    // Base64 response
    if (
        imageResult?.data?.[0]?.b64_json
    ) {
        return (
            "data:image/png;base64," +
            imageResult.data[0].b64_json
        );
    }

    // URL response
    if (
        imageResult?.data?.[0]?.url
    ) {
        return (
            imageResult.data[0].url
        );
    }

    // Root URL response
    if (
        imageResult?.url
    ) {
        return imageResult.url;
    }

    return null;
}

// ============================================================
// API: ANALYZE
// ============================================================

app.post(
    "/api/analyze",
    upload.single("image"),

    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Please upload a smile photograph."
                });

            }

            console.log(
                "Received image for analysis:",
                req.file.originalname
            );

            console.log(
                "Image size:",
                req.file.size,
                "bytes"
            );

            console.log(
                "Image type:",
                req.file.mimetype
            );

            console.log(
                "Analyzing image with Kimi K3..."
            );

            const rawReport =
                await analyzeSmile(
                    req.file.buffer,
                    req.file.mimetype
                );

            const report =
                normalizeReport(
                    parseKimiReport(
                        rawReport
                    )
                );

            console.log(
                "Kimi analysis received."
            );

            console.log(
                "Visualization allowed:",
                report.visualization_ready
            );

            if (
                !report.visualization_ready
            ) {

                console.log(
                    "BLOCKING REASONS:",
                    getBlockingReasons(
                        report
                    )
                );

            }

            const imagePrompt =
                report.visualization_ready
                    ? buildImagePrompt(
                        report
                    )
                    : null;

            return res.json({

                success: true,

                report,

                imagePrompt

            });

        } catch (error) {

            console.error(
                "Analyze error:",
                error.response?.data ||
                error.message
            );

            return res.status(500).json({

                success: false,

                error:
                    error.response?.data
                        ?.error?.message ||

                    error.response?.data
                        ?.error ||

                    error.message ||

                    "Unable to analyze the smile."

            });

        }

    }
);

// ============================================================
// API: GENERATE
// ============================================================

app.post(
    "/api/generate",
    upload.single("image"),

    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Please upload the original smile photograph."
                });

            }

            if (!req.body.report) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Smile analysis report is missing. Please analyze the image first."
                });

            }

            let report;

            try {

                report =
                    normalizeReport(
                        JSON.parse(
                            req.body.report
                        )
                    );

            } catch (error) {

                return res.status(400).json({
                    success: false,
                    error:
                        "The smile analysis report is invalid. Please analyze the image again."
                });

            }

            // Server-side image quality block
            if (
                !isVisualizationAllowed(
                    report
                )
            ) {

                const blockingReasons =
                    getBlockingReasons(
                        report
                    );

                console.log(
                    "Visualization blocked:",
                    blockingReasons
                );

                return res.status(422).json({

                    success: false,

                    code:
                        "IMAGE_NOT_SUITABLE",

                    error:
                        "Please capture a clearer smile photograph with the teeth clearly visible before generating a visualization.",

                    blockingReasons

                });

            }

            console.log(
                "Generating smile visualization with Pollinations..."
            );

            const imagePrompt =
                buildImagePrompt(
                    report
                );

            const imageResult =
                await generateSmile(
                    req.file.buffer,
                    req.file.mimetype,
                    imagePrompt
                );

            const generatedImage =
                extractGeneratedImage(
                    imageResult
                );

            if (!generatedImage) {

                console.error(
                    "Pollinations response:",
                    JSON.stringify(
                        imageResult,
                        null,
                        2
                    )
                );

                throw new Error(
                    "Pollinations returned no generated image."
                );

            }

            console.log(
                "Smile visualization generated."
            );

            return res.json({

                success: true,

                generatedImage,

                imagePrompt

            });

        } catch (error) {

            console.error(
                "Generation error:",
                error.response?.data ||
                error.message
            );

            return res.status(500).json({

                success: false,

                error:
                    error.response?.data
                        ?.error?.message ||

                    error.response?.data
                        ?.error ||

                    error.message ||

                    "Unable to generate the visualization."

            });

        }

    }
);

// ============================================================
// LEGACY COMBINED ENDPOINT
// ============================================================

app.post(
    "/api/simulate",
    upload.single("image"),

    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Please upload a smile photograph."
                });

            }

            console.log(
                "Running legacy combined simulation..."
            );

            // Analyze
            const rawReport =
                await analyzeSmile(
                    req.file.buffer,
                    req.file.mimetype
                );

            const report =
                normalizeReport(
                    parseKimiReport(
                        rawReport
                    )
                );

            // Block unsuitable image
            if (
                !isVisualizationAllowed(
                    report
                )
            ) {

                return res.status(422).json({

                    success: false,

                    code:
                        "IMAGE_NOT_SUITABLE",

                    error:
                        "Please capture a clearer smile photograph with the teeth clearly visible before generating a visualization.",

                    report,

                    blockingReasons:
                        getBlockingReasons(
                            report
                        )

                });

            }

            // Generate
            const imagePrompt =
                buildImagePrompt(
                    report
                );

            const imageResult =
                await generateSmile(
                    req.file.buffer,
                    req.file.mimetype,
                    imagePrompt
                );

            const generatedImage =
                extractGeneratedImage(
                    imageResult
                );

            if (!generatedImage) {

                throw new Error(
                    "Pollinations returned no generated image."
                );

            }

            return res.json({

                success: true,

                report,

                imagePrompt,

                generatedImage

            });

        } catch (error) {

            console.error(
                "Simulation error:",
                error.response?.data ||
                error.message
            );

            return res.status(500).json({

                success: false,

                error:
                    error.response?.data
                        ?.error?.message ||

                    error.response?.data
                        ?.error ||

                    error.message ||

                    "Unable to complete the smile simulation."

            });

        }

    }
);

// ============================================================
// MULTER / GLOBAL ERROR HANDLER
// ============================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "Unhandled server error:",
            error
        );

        // File upload errors
        if (
            error instanceof
            multer.MulterError
        ) {

            return res.status(400).json({

                success: false,

                error:
                    error.code ===
                    "LIMIT_FILE_SIZE"

                        ? "Image is too large. Maximum size is 10 MB."

                        : error.message

            });

        }

        return res.status(500).json({

            success: false,

            error:
                error.message ||
                "Internal server error."

        });

    }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    "0.0.0.0",

    () => {

        console.log(
            `Smile Simulator running on port ${PORT}`
        );

        console.log(
            `Health check: http://localhost:${PORT}/api/health`
        );

    }
);