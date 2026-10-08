require("dotenv").config();



const express = require("express");

const multer = require("multer");

const axios = require("axios");

const FormData = require("form-data");
const sharp = require("sharp");



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



// ============================================================
// KIMI PROVIDER FAILOVER
// ============================================================
//
// Primary:
//   NVIDIA NIM / Kimi K3
//
// Backup:
//   Pollinations / Kimi K3
//
// The frontend/API response shape is unchanged. This layer only
// changes which provider supplies the Kimi analysis.
//

const KIMI_PRIMARY_TIMEOUT_MS = Number(
    process.env.KIMI_PRIMARY_TIMEOUT_MS || 120000
);

const KIMI_FALLBACK_TIMEOUT_MS = Number(
    process.env.KIMI_FALLBACK_TIMEOUT_MS || 180000
);

const NVIDIA_KIMI_URL =
    "https://integrate.api.nvidia.com/v1/chat/completions";

const POLLINATIONS_KIMI_URL =
    "https://gen.pollinations.ai/v1/chat/completions";


function shouldFallbackToPollinations(error) {

    const status = error?.response?.status;

    const code = String(error?.code || "");

    const message = String(error?.message || "").toLowerCase();

    // Client-side/network failures.
    if (
        code === "ECONNABORTED" ||
        code === "ETIMEDOUT" ||
        code === "ECONNRESET" ||
        code === "ECONNREFUSED" ||
        code === "ENETUNREACH" ||
        message.includes("timeout") ||
        message.includes("timed out") ||
        message.includes("socket hang up")
    ) {
        return true;
    }

    // If NVIDIA is temporarily unavailable, rate-limited, or its
    // authentication is unavailable, the backup provider can try.
    if (
        status === 401 ||
        status === 403 ||
        status === 408 ||
        status === 429 ||
        status >= 500
    ) {
        return true;
    }

    // No HTTP response generally means the connection itself failed.
    if (!error?.response) {
        return true;
    }

    return false;
}


function extractKimiContent(responseData, isStream = false) {

    if (isStream) {

        let finalContent = "";

        for (
            const line of String(responseData || "").split("\n")
        ) {

            const trimmed = line.trim();

            if (
                !trimmed ||
                !trimmed.startsWith("data:")
            ) {
                continue;
            }

            const data = trimmed.substring(5).trim();

            if (data === "[DONE]") {
                continue;
            }

            try {

                const parsed = JSON.parse(data);

                const choice =
                    parsed?.choices?.[0];

                const delta =
                    choice?.delta || {};

                let piece =
                    delta?.content;

                if (Array.isArray(piece)) {

                    piece = piece
                        .map(item => {

                            if (
                                typeof item === "string"
                            ) {
                                return item;
                            }

                            return (
                                item?.text ||
                                item?.content ||
                                ""
                            );

                        })
                        .join("");
                }

                if (
                    typeof piece === "string" &&
                    piece
                ) {
                    finalContent += piece;
                }

                if (
                    !piece &&
                    typeof choice?.text === "string"
                ) {
                    finalContent += choice.text;
                }

            } catch (error) {

                // Ignore malformed SSE lines.

            }
        }

        return finalContent.trim();
    }

    const messageContent =
        responseData?.choices?.[0]?.message?.content;

    if (Array.isArray(messageContent)) {

        return messageContent
            .map(item => {

                if (typeof item === "string") {
                    return item;
                }

                return (
                    item?.text ||
                    item?.content ||
                    ""
                );

            })
            .join("")
            .trim();
    }

    if (
        typeof messageContent === "string" &&
        messageContent.trim()
    ) {
        return messageContent.trim();
    }

    if (
        typeof responseData?.choices?.[0]?.text === "string"
    ) {
        return responseData.choices[0].text.trim();
    }

    return "";
}


async function callKimiWithFallback({
    imageDataUrl,
    prompt,
    operationName,
    primaryMaxTokens = 4096,
    fallbackMaxTokens = 4096,
    retryPrimaryWithoutStream = false
}) {

    const messages = [
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
    ];

    let primaryError = null;

    // --------------------------------------------------------
    // PRIMARY: NVIDIA KIMI K3
    // --------------------------------------------------------

    try {

        console.log("");
        console.log("----------------------------------------");
        console.log(`KIMI PRIMARY: NVIDIA (${operationName})`);
        console.log("----------------------------------------");

        const response = await axios.post(
            NVIDIA_KIMI_URL,
            {
                model: "moonshotai/kimi-k3",
                messages,
                reasoning_effort: "low",
                temperature: 1,
                max_tokens: primaryMaxTokens,
                stream: true
            },
            {
                headers: {
                    Authorization:
                        `Bearer ${process.env.NVIDIA_API_KEY}`,
                    Accept: "text/event-stream",
                    "Content-Type": "application/json"
                },
                responseType: "text",
                timeout: KIMI_PRIMARY_TIMEOUT_MS
            }
        );

        let finalContent =
            extractKimiContent(
                response.data,
                true
            );

        if (finalContent) {

            console.log(
                `Kimi provider: NVIDIA (${operationName})`
            );

            return {
                content: finalContent,
                provider: "nvidia"
            };
        }

        // Some Kimi image requests can complete the stream without
        // placing the final answer in delta.content. Preserve the
        // existing selected-tooth retry behavior when requested.
        if (retryPrimaryWithoutStream) {

            console.warn(
                `NVIDIA Kimi ${operationName} returned no final content. Retrying once without streaming...`
            );

            const retryResponse = await axios.post(
                NVIDIA_KIMI_URL,
                {
                    model: "moonshotai/kimi-k3",
                    messages,
                    reasoning_effort: "low",
                    temperature: 0.2,
                    max_tokens: Math.min(
                        primaryMaxTokens,
                        4096
                    ),
                    stream: false
                },
                {
                    headers: {
                        Authorization:
                            `Bearer ${process.env.NVIDIA_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    timeout: KIMI_PRIMARY_TIMEOUT_MS
                }
            );

            finalContent =
                extractKimiContent(
                    retryResponse.data,
                    false
                );

            if (finalContent) {

                console.log(
                    `Kimi provider: NVIDIA retry (${operationName})`
                );

                return {
                    content: finalContent,
                    provider: "nvidia"
                };
            }
        }

        primaryError = new Error(
            `NVIDIA Kimi returned no final content for ${operationName}.`
        );

    } catch (error) {

        primaryError = error;

        console.warn("");
        console.warn(
            `NVIDIA Kimi failed for ${operationName}.`
        );
        console.warn(
            "Reason:",
            error?.response?.data ||
            error?.message ||
            error
        );

    }

    // --------------------------------------------------------
    // FALLBACK DECISION
    // --------------------------------------------------------

    if (
        !shouldFallbackToPollinations(primaryError)
    ) {
        throw primaryError;
    }

    console.warn("");
    console.warn(
        `NVIDIA Kimi unavailable for ${operationName}.`
    );
    console.warn(
        "Switching automatically to Pollinations Kimi K3..."
    );

    // --------------------------------------------------------
    // BACKUP: POLLINATIONS KIMI K3
    // --------------------------------------------------------

    try {

        console.log("");
        console.log("----------------------------------------");
        console.log(
            `KIMI BACKUP: POLLINATIONS (${operationName})`
        );
        console.log("----------------------------------------");

        const fallbackResponse = await axios.post(
            POLLINATIONS_KIMI_URL,
            {
                model: "moonshotai/kimi-k3",
                messages,
                reasoning_effort: "low",
                temperature: 1,
                max_tokens: fallbackMaxTokens,
                stream: false
            },
            {
                headers: {
                    Authorization:
                        `Bearer ${process.env.POLLINATIONS_API_KEY}`,
                    "Content-Type": "application/json"
                },
                timeout: KIMI_FALLBACK_TIMEOUT_MS
            }
        );

        const fallbackContent =
            extractKimiContent(
                fallbackResponse.data,
                false
            );

        if (!fallbackContent) {

            throw new Error(
                `Pollinations Kimi returned no final content for ${operationName}.`
            );
        }

        console.log(
            `Kimi provider: Pollinations backup (${operationName})`
        );

        return {
            content: fallbackContent,
            provider: "pollinations"
        };

    } catch (fallbackError) {

        console.error("");
        console.error(
            `Pollinations Kimi fallback also failed for ${operationName}.`
        );
        console.error(
            fallbackError?.response?.data ||
            fallbackError?.message ||
            fallbackError
        );

        // Surface the backup error, but preserve the fact that the
        // primary provider also failed.
        fallbackError.primaryKimiError =
            primaryError?.message || String(primaryError);

        throw fallbackError;
    }
}


async function analyzeSmile(imageBuffer, mimeType) {

    const base64Image =
        imageBuffer.toString("base64");

    const imageDataUrl =
        `data:${mimeType};base64,${base64Image}`;

    const metadata =
        await sharp(imageBuffer).metadata();

    const imageWidth =
        Number(metadata.width || 0);

    const imageHeight =
        Number(metadata.height || 0);

    const prompt = `

Analyze this smile photograph for a dental aesthetic visualization.

Look ONLY at what is visibly present in the image.

IMAGE DIMENSIONS:
- width: ${imageWidth} pixels
- height: ${imageHeight} pixels

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

RETURN ONLY VALID JSON.

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
  "tooth_targets": [
    {
      "tooth": "11",
      "label": "Upper right central incisor",
      "visible": true,
      "analyzable": true,
      "confidence": 0.94,
      "center": {
        "x": 415,
        "y": 300
      },
      "bbox": {
        "x": 388,
        "y": 268,
        "width": 55,
        "height": 68
      },
      "reason": "Clearly visible and individually localizable"
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

TOOTH LOCALIZATION RULES:

- Identify only teeth that are actually visible in this photograph.
- Use valid FDI two-digit numbering.
- Do not list all 32 teeth automatically.
- Prioritize teeth whose individual crown boundaries can actually be distinguished.
- A tooth may be visible but NOT analyzable if too little of its crown is visible, if neighboring teeth cannot be separated confidently, or if the tooth identity cannot be localized reliably.
- Set visible=true only when some part of the tooth is actually visible.
- Set analyzable=true only when you can confidently identify the FDI tooth and locate its visible crown well enough for a tooth-specific visual analysis.
- If analyzable=false, still return the tooth only when you can identify it as visible, and include a short reason.
- Omit a tooth entirely if you cannot even identify which tooth it is.
- Do not let a hypothetical dentist selection, marker, or red dot influence this analysis. This first-pass analysis must be based on the unmodified photograph only.
- confidence must be 0..1 and must reflect confidence in identifying and localizing that specific tooth.

COORDINATE RULES:

- Return center and bbox in PIXEL COORDINATES relative to the exact image supplied to you.
- Do NOT normalize coordinates to 0-1000.
- x must be between 0 and ${imageWidth}.
- y must be between 0 and ${imageHeight}.
- bbox.x + bbox.width must not exceed ${imageWidth}.
- bbox.y + bbox.height must not exceed ${imageHeight}.
- The center must lie inside the visible tooth crown whenever reasonably possible.
- Keep the bbox reasonably tight around the visible crown.
- Avoid including neighboring teeth, lips, and large gum areas.
- The bbox is a localization reference only, NOT a segmentation mask.

IMPORTANT:

- visualization_ready should be TRUE when the visible teeth can reasonably be edited.
- Only set visualization_ready to FALSE when the overall photograph cannot reasonably be evaluated.
- Do not use normal dental imperfections as blocking reasons.
- blocking_reasons must remain [] unless there is a genuine image-quality problem.

`;

    console.log(
        "Sending image to Kimi K3..."
    );

    const kimiResult =
        await callKimiWithFallback({
            imageDataUrl,
            prompt,
            operationName: "full smile analysis",
            primaryMaxTokens: 4096,
            fallbackMaxTokens: 4096,
            retryPrimaryWithoutStream: false
        });

    console.log(
        "Kimi final content length:",
        kimiResult.content.length
    );

    console.log(
        "Kimi provider used:",
        kimiResult.provider
    );

    return kimiResult.content.trim();
}



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


// ============================================================
// TOOTH TARGET NORMALIZATION
// ============================================================

const VALID_FDI_TEETH = new Set([
    "11","12","13","14","15","16","17","18",
    "21","22","23","24","25","26","27","28",
    "31","32","33","34","35","36","37","38",
    "41","42","43","44","45","46","47","48"
]);

function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function normalizeToothTargets(targets) {
    if (!Array.isArray(targets)) return [];

    const seen = new Set();
    const normalized = [];

    for (const item of targets) {
        const tooth = String(item?.tooth || "").trim();

        if (!VALID_FDI_TEETH.has(tooth)) continue;
        if (seen.has(tooth)) continue;
        if (item?.visible === false) continue;
        if (!item?.bbox) continue;

        const rawBbox = item.bbox || {};
        const rawCenter = item.center || {
            x: Number(rawBbox.x || 0) + Number(rawBbox.width || 0) / 2,
            y: Number(rawBbox.y || 0) + Number(rawBbox.height || 0) / 2
        };

        const x = Math.max(0, Math.round(Number(rawBbox.x || 0)));
        const y = Math.max(0, Math.round(Number(rawBbox.y || 0)));
        const width = Math.max(1, Math.round(Number(rawBbox.width || 1)));
        const height = Math.max(1, Math.round(Number(rawBbox.height || 1)));

        const centerX = Math.max(0, Math.round(Number(rawCenter.x || 0)));
        const centerY = Math.max(0, Math.round(Number(rawCenter.y || 0)));

        const confidence = clampNumber(
            item?.confidence ?? 0,
            0,
            1
        );

        normalized.push({
            tooth,
            label: String(item?.label || ""),
            visible: true,
            analyzable: item?.analyzable !== false,
            confidence,
            reason: String(item?.reason || ""),
            center: {
                x: centerX,
                y: centerY
            },
            bbox: {
                x,
                y,
                width,
                height
            }
        });

        seen.add(tooth);
    }

    return normalized;
}

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

            report.image_edit_instructions || "",

        tooth_targets:

            normalizeToothTargets(

                report.tooth_targets

            )

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

            console.log(
                "Tooth targets detected:",
                report.tooth_targets.length
            );

            console.log(
                "Tooth targets:",
                JSON.stringify(report.tooth_targets, null, 2)
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


// ============================================================
// TOOTH MASK HELPERS
// ============================================================

function morphologyDilate(mask, width, height, radius = 1) {
    const output = new Uint8Array(mask.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let found = false;

            for (let dy = -radius; dy <= radius && !found; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;

                    if (
                        nx >= 0 && nx < width &&
                        ny >= 0 && ny < height &&
                        mask[ny * width + nx] > 0
                    ) {
                        found = true;
                        break;
                    }
                }
            }

            output[y * width + x] = found ? 255 : 0;
        }
    }

    return output;
}

function morphologyErode(mask, width, height, radius = 1) {
    const output = new Uint8Array(mask.length);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let allFilled = true;

            for (let dy = -radius; dy <= radius && allFilled; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;

                    if (
                        nx < 0 || nx >= width ||
                        ny < 0 || ny >= height ||
                        mask[ny * width + nx] === 0
                    ) {
                        allFilled = false;
                        break;
                    }
                }
            }

            output[y * width + x] = allFilled ? 255 : 0;
        }
    }

    return output;
}

function morphologyClose(mask, width, height, radius = 1) {
    return morphologyErode(
        morphologyDilate(mask, width, height, radius),
        width,
        height,
        radius
    );
}

function morphologyOpen(mask, width, height, radius = 1) {
    return morphologyDilate(
        morphologyErode(mask, width, height, radius),
        width,
        height,
        radius
    );
}

function keepBestComponent(mask, width, height, targetX, targetY) {
    const visited = new Uint8Array(mask.length);
    let best = null;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const start = y * width + x;

            if (mask[start] === 0 || visited[start]) continue;

            const queue = [[x, y]];
            const pixels = [];
            visited[start] = 1;

            let sumX = 0;
            let sumY = 0;

            while (queue.length) {
                const [px, py] = queue.pop();

                pixels.push([px, py]);
                sumX += px;
                sumY += py;

                const neighbors = [
                    [px + 1, py],
                    [px - 1, py],
                    [px, py + 1],
                    [px, py - 1]
                ];

                for (const [nx, ny] of neighbors) {
                    if (
                        nx < 0 || nx >= width ||
                        ny < 0 || ny >= height
                    ) continue;

                    const index = ny * width + nx;

                    if (visited[index] || mask[index] === 0) continue;

                    visited[index] = 1;
                    queue.push([nx, ny]);
                }
            }

            if (pixels.length < 3) continue;

            const centerX = sumX / pixels.length;
            const centerY = sumY / pixels.length;

            const distance = Math.sqrt(
                Math.pow(centerX - targetX, 2) +
                Math.pow(centerY - targetY, 2)
            );

            const score =
                distance -
                Math.min(pixels.length / 10, 30);

            if (!best || score < best.score) {
                best = { pixels, score };
            }
        }
    }

    const output = new Uint8Array(mask.length);

    if (!best) return output;

    for (const [x, y] of best.pixels) {
        output[y * width + x] = 255;
    }

    return output;
}

// ============================================================

// ============================================================
// SELECTED TOOTH WORKFLOW
// ============================================================

async function analyzeSelectedTooth(
    imageBuffer,
    mimeType,
    target,
    fullReport
) {

    const base64Image =
        imageBuffer.toString("base64");

    const imageDataUrl =
        `data:${mimeType};base64,${base64Image}`;

    const prompt = `
You are performing a second-pass visual analysis for a dentist.

The original photograph is the ONLY source of truth for whether the selected tooth exists and can be analyzed.

The dentist selected FDI tooth ${target.tooth} from a list of teeth that the first-pass Kimi analysis marked as visible/analyzable.

FIRST-PASS TARGET METADATA:
${JSON.stringify(target, null, 2)}

IMPORTANT:
- Independently look at the ORIGINAL photograph.
- Verify that FDI tooth ${target.tooth} is actually visible and sufficiently identifiable.
- Do NOT treat a marker, dot, bbox, or dentist selection as proof that the tooth exists.
- Do NOT analyze another tooth if the selected tooth cannot be verified.
- Do NOT diagnose disease.
- Base every observation only on what is visibly present.

If the selected tooth is NOT sufficiently visible or identifiable, return:
{
  "success": false,
  "tooth": "${target.tooth}",
  "analyzable": false,
  "reason": "short reason"
}

If it IS sufficiently visible, return ONLY valid JSON using:
{
  "success": true,
  "tooth": "${target.tooth}",
  "label": "...",
  "analyzable": true,
  "confidence": 0.0,
  "assessment": {
    "visibility": "...",
    "alignment": "...",
    "rotation": "...",
    "spacing": "...",
    "shape": "...",
    "proportion": "...",
    "incisal_edge": "...",
    "shade": "...",
    "surface_appearance": "...",
    "relationship_to_adjacent_teeth": "..."
  },
  "visualization": {
    "whitening": true,
    "alignment": false,
    "enamel_recontouring": false,
    "veneer_visualization": false
  },
  "visualization_instructions": "Concise instructions describing only the changes to visualize on this tooth while preserving natural anatomy and the rest of the photograph.",
  "summary": "Short tooth-specific summary."
}

Do not mention or rely on the bbox as if it were a segmentation mask.
`;

    console.log("");
    console.log("========================================");
    console.log("KIMI SELECTED TOOTH ANALYSIS");
    console.log("========================================");
    console.log("Tooth:", target.tooth);

    const kimiResult =
        await callKimiWithFallback({
            imageDataUrl,
            prompt,
            operationName: `selected tooth ${target.tooth} analysis`,
            primaryMaxTokens: 4096,
            fallbackMaxTokens: 4096,
            retryPrimaryWithoutStream: true
        });

    console.log(
        "Kimi selected-tooth provider:",
        kimiResult.provider
    );

    const result =
        parseKimiReport(kimiResult.content);

    console.log(
        "SELECTED TOOTH KIMI RESULT:",
        JSON.stringify(result, null, 2)
    );

    return result;
}



async function createToothReferenceImage(imageBuffer, target) {
    const metadata = await sharp(imageBuffer).metadata();

    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);

    if (!width || !height) {
        throw new Error("Unable to determine image dimensions.");
    }

    const bbox = target.bbox || {};
    const center = target.center || {
        x: Number(bbox.x || 0) + Number(bbox.width || 0) / 2,
        y: Number(bbox.y || 0) + Number(bbox.height || 0) / 2
    };

    const x = Math.max(0, Math.min(width - 1, Math.round(Number(bbox.x || 0))));
    const y = Math.max(0, Math.min(height - 1, Math.round(Number(bbox.y || 0))));
    const boxWidth = Math.max(1, Math.min(width - x, Math.round(Number(bbox.width || 1))));
    const boxHeight = Math.max(1, Math.min(height - y, Math.round(Number(bbox.height || 1))));

    const cx = Math.max(0, Math.min(width - 1, Math.round(Number(center.x || 0))));
    const cy = Math.max(0, Math.min(height - 1, Math.round(Number(center.y || 0))));

    // Keep the annotation outside the tooth as much as possible.
    const labelWidth = 170;
    const labelHeight = 42;

    let labelX = x + boxWidth + 14;
    if (labelX + labelWidth > width - 8) {
        labelX = Math.max(8, x - labelWidth - 14);
    }

    let labelY = Math.max(8, y - labelHeight - 12);
    if (labelY + labelHeight > height - 8) {
        labelY = Math.max(8, Math.min(height - labelHeight - 8, y + boxHeight + 12));
    }

    const lineEndX = labelX < x
        ? labelX + labelWidth
        : labelX;

    const lineEndY = labelY + labelHeight / 2;

    const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect
        x="${x}"
        y="${y}"
        width="${boxWidth}"
        height="${boxHeight}"
        fill="none"
        stroke="#00e676"
        stroke-width="3"
        stroke-dasharray="7 5"
        rx="4"
    />

    <circle
        cx="${cx}"
        cy="${cy}"
        r="5"
        fill="#00e676"
        stroke="#ffffff"
        stroke-width="2"
    />

    <line
        x1="${cx}"
        y1="${cy}"
        x2="${lineEndX}"
        y2="${lineEndY}"
        stroke="#00e676"
        stroke-width="3"
    />

    <rect
        x="${labelX}"
        y="${labelY}"
        width="${labelWidth}"
        height="${labelHeight}"
        rx="9"
        fill="#101820"
        fill-opacity="0.90"
    />

    <text
        x="${labelX + 12}"
        y="${labelY + 27}"
        font-family="Arial, sans-serif"
        font-size="19"
        font-weight="700"
        fill="#ffffff"
    >FDI ${String(target.tooth)} ✓</text>
</svg>`;

    return sharp(imageBuffer)
        .composite([
            {
                input: Buffer.from(svg),
                top: 0,
                left: 0
            }
        ])
        .jpeg({ quality: 95 })
        .toBuffer();
}


function buildToothVisualizationPrompt(
    target,
    toothReport
) {
    return `
Create a photorealistic dental visualization by editing the supplied ISOLATED TOOTH CROP.

IMPORTANT:
The supplied image is NOT the full patient photograph. It is a cropped editing region taken from the original photograph and contains the selected tooth plus a small amount of surrounding visual context.

SELECTED TOOTH:
FDI ${target.tooth} — ${target.label || "selected tooth"}

LOCATION REFERENCE IN THE ORIGINAL IMAGE:
${JSON.stringify({
        center: target.center,
        bbox: target.bbox
    }, null, 2)}

TOOTH-SPECIFIC KIMI REPORT:
${JSON.stringify(toothReport, null, 2)}

STRICT EDITING RULES:

- Modify ONLY FDI ${target.tooth}.
- The selected tooth is the ONLY dental structure that may be changed.
- Do not whiten, reshape, resize, rotate, move, or otherwise alter adjacent teeth.
- Do not modify any other tooth.
- Do not modify gums.
- Do not modify lips.
- Do not modify skin.
- Do not modify facial identity.
- Do not modify the jaw or facial structure.
- Preserve the original perspective, lighting, camera geometry and surrounding context.
- Preserve natural tooth anatomy, translucency, enamel texture and realistic imperfections unless the Kimi instructions explicitly request a change.
- Make the requested change subtle and clinically plausible.
- Do not invent additional cosmetic improvements.
- Do not add veneers, crowns, fillings, braces or other dental work unless explicitly requested.
- Do not change the color or shape of neighboring teeth just to make the selected tooth match them.

The final image must be an unannotated photograph crop.
There are no FDI labels, boxes, points or leader lines that should appear in the output.

VISUALIZATION INSTRUCTIONS:
${toothReport?.visualization_instructions || "Make only a subtle natural improvement to the selected tooth."}

Generate ONLY the edited image crop. Do not generate a full face or a new smile photograph.
`;
}


async function generateToothVisualization(
    editingCropBuffer,
    mimeType,
    prompt
) {
    const form = new FormData();

    form.append(
        "image",
        editingCropBuffer,
        {
            filename: "isolated-tooth-editing-crop.jpg",
            contentType: mimeType || "image/jpeg"
        }
    );

    form.append("prompt", prompt);
    form.append("model", "microsoft/mai-image-2.6");

    const response = await axios.post(
        "https://gen.pollinations.ai/v1/images/edits",
        form,
        {
            headers: {
                ...form.getHeaders(),
                Authorization:
                    `Bearer ${process.env.POLLINATIONS_API_KEY}`
            },
            responseType: "json",
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 300000
        }
    );

    return response.data;
}


function dataUrlToBuffer(dataUrl) {
    if (typeof dataUrl !== "string") {
        throw new Error("Generated image is not a valid data URL.");
    }

    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/s);

    if (!match) {
        throw new Error("Generated image data URL is invalid.");
    }

    return Buffer.from(match[1], "base64");
}


async function generatedImageToBuffer(generatedImage) {
    if (!generatedImage) {
        throw new Error("No generated image was returned by MAI Image 2.6.");
    }

    if (Buffer.isBuffer(generatedImage)) {
        return generatedImage;
    }

    if (generatedImage.startsWith("data:")) {
        return dataUrlToBuffer(generatedImage);
    }

    if (/^https?:\/\//i.test(generatedImage)) {
        const response = await axios.get(generatedImage, {
            responseType: "arraybuffer",
            timeout: 300000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        return Buffer.from(response.data);
    }

    throw new Error("Unsupported generated image format.");
}


async function createIsolatedToothEditingCrop(
    imageBuffer,
    target
) {
    const metadata = await sharp(imageBuffer).metadata();
    const imageWidth = Number(metadata.width || 0);
    const imageHeight = Number(metadata.height || 0);

    if (!imageWidth || !imageHeight) {
        throw new Error("Unable to determine original image dimensions.");
    }

    const bbox = target.bbox || {};

    const bx = Number(bbox.x || 0);
    const by = Number(bbox.y || 0);
    const bw = Number(bbox.width || 0);
    const bh = Number(bbox.height || 0);

    if (bw <= 0 || bh <= 0) {
        throw new Error("Selected tooth has an invalid bounding box.");
    }

    // Give MAI useful context around the selected tooth, but do not send
    // the entire photograph for the precise editing operation.
    const padX = Math.max(12, Math.round(bw * 0.45));
    const padY = Math.max(12, Math.round(bh * 0.45));

    const left = Math.max(0, Math.round(bx - padX));
    const top = Math.max(0, Math.round(by - padY));
    const right = Math.min(imageWidth, Math.round(bx + bw + padX));
    const bottom = Math.min(imageHeight, Math.round(by + bh + padY));

    const cropWidth = Math.max(1, right - left);
    const cropHeight = Math.max(1, bottom - top);

    const cropBuffer = await sharp(imageBuffer)
        .extract({
            left,
            top,
            width: cropWidth,
            height: cropHeight
        })
        .jpeg({ quality: 98 })
        .toBuffer();

    return {
        buffer: cropBuffer,
        left,
        top,
        width: cropWidth,
        height: cropHeight,
        toothX: Math.max(0, Math.round(bx - left)),
        toothY: Math.max(0, Math.round(by - top)),
        toothWidth: Math.min(cropWidth, Math.round(bw)),
        toothHeight: Math.min(cropHeight, Math.round(bh))
    };
}


async function compositeIsolatedToothOntoOriginal(
    originalBuffer,
    generatedCropBuffer,
    cropInfo
) {
    const generated = sharp(generatedCropBuffer).resize({
        width: cropInfo.width,
        height: cropInfo.height,
        fit: "fill"
    });

    // The Kimi bbox is the localization authority. We only allow the
    // generated crop to replace pixels inside that target region. A soft
    // feather reduces visible seams at the tooth boundary.
    const feather = Math.max(
        3,
        Math.min(8, Math.round(Math.min(cropInfo.toothWidth, cropInfo.toothHeight) * 0.08))
    );

    const maskSvg = `
<svg width="${cropInfo.width}" height="${cropInfo.height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="black"/>
    <rect
        x="${cropInfo.toothX}"
        y="${cropInfo.toothY}"
        width="${cropInfo.toothWidth}"
        height="${cropInfo.toothHeight}"
        rx="${Math.max(4, Math.round(Math.min(cropInfo.toothWidth, cropInfo.toothHeight) * 0.10))}"
        fill="white"
        filter="url(#blur)"
    />
    <defs>
        <filter id="blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="${feather}"/>
        </filter>
    </defs>
</svg>`;

    const maskBuffer = await sharp(Buffer.from(maskSvg))
        .png()
        .toBuffer();

    const generatedRgba = await generated
        .removeAlpha()
        .joinChannel(maskBuffer)
        .png()
        .toBuffer();

    return sharp(originalBuffer)
        .composite([
            {
                input: generatedRgba,
                left: cropInfo.left,
                top: cropInfo.top
            }
        ])
        .jpeg({ quality: 98 })
        .toBuffer();
}


// ============================================================
// KIMI PRECISE TOOTH LOCALIZATION
// ============================================================

async function localizeTeethWithKimi(imageBuffer, mimeType) {

    const base64Image =
        imageBuffer.toString("base64");

    const imageDataUrl =
        `data:${mimeType};base64,${base64Image}`;

    const metadata =
        await sharp(imageBuffer).metadata();

    const imageWidth =
        Number(metadata.width || 0);

    const imageHeight =
        Number(metadata.height || 0);

    if (!imageWidth || !imageHeight) {
        throw new Error(
            "Unable to determine image dimensions."
        );
    }

    const prompt = `
You are performing PRECISE INDIVIDUAL TOOTH LOCALIZATION for a dentist.

Use ONLY the original photograph supplied with this request.
Do not use any previous report, hypothetical selection, marker, or annotation.

IMAGE DIMENSIONS:
width: ${imageWidth}
height: ${imageHeight}

Your job is NOT to analyze the whole smile.
Your job is to identify ONLY teeth whose individual visible crowns can be reasonably localized in this exact image.

FDI NUMBERING:
Upper patient's right: 18 17 16 15 14 13 12 11
Upper patient's left: 21 22 23 24 25 26 27 28
Lower patient's right: 48 47 46 45 44 43 42 41
Lower patient's left: 31 32 33 34 35 36 37 38

IMPORTANT FRONTAL-PHOTO RULE:
For a normal frontal photograph, the patient's right side appears on the viewer's left.

DEFINITIONS:
- visible=true means some portion of that tooth is actually visible.
- analyzable=true means you can reliably identify the FDI tooth AND localize its visible crown sufficiently for a tooth-specific analysis.
- A tooth may be visible but not analyzable.
- Do not invent teeth that cannot be identified.
- Do not automatically return all 32 teeth.
- Do not merge two neighboring teeth into one target.
- Do not use the same center point for two different teeth.
- The center should be inside the visible crown whenever reasonably possible.
- The bbox is a localization guide, NOT a segmentation mask.

RETURN ONLY VALID JSON.

Use exactly:
{
  "image_width": ${imageWidth},
  "image_height": ${imageHeight},
  "teeth": [
    {
      "tooth": "11",
      "label": "Upper right central incisor",
      "visible": true,
      "analyzable": true,
      "confidence": 0.95,
      "center": { "x": 270, "y": 294 },
      "bbox": { "x": 243, "y": 256, "width": 62, "height": 76 },
      "reason": "Clearly visible and individually localizable"
    }
  ]
}

COORDINATES:
- Use exact pixel coordinates relative to the supplied image.
- Do NOT normalize to 0-1000.
- x must be 0..${imageWidth}.
- y must be 0..${imageHeight}.
- bbox.x + bbox.width must not exceed ${imageWidth}.
- bbox.y + bbox.height must not exceed ${imageHeight}.
- Keep each bbox reasonably tight around the visible crown.
- Avoid large areas of lips, gums, or neighboring teeth.
- confidence must be between 0 and 1.
- If a tooth cannot be reliably localized, omit it or mark analyzable=false.
`;

    console.log("");
    console.log("========================================");
    console.log("KIMI PRECISE TOOTH LOCALIZATION");
    console.log("========================================");
    console.log(
        `Image dimensions: ${imageWidth} x ${imageHeight}`
    );
    console.log(
        "Sending precise localization request to Kimi K3..."
    );

    const kimiResult =
        await callKimiWithFallback({
            imageDataUrl,
            prompt,
            operationName: "precise tooth localization",
            primaryMaxTokens: 4096,
            fallbackMaxTokens: 4096,
            retryPrimaryWithoutStream: false
        });

    console.log(
        "Kimi localization provider:",
        kimiResult.provider
    );

    return parseKimiToothLocalization(
        kimiResult.content
    );
}



function parseKimiToothLocalization(rawLocalization) {
    if (!rawLocalization) {
        throw new Error("Kimi returned an empty tooth localization result.");
    }

    let cleaned = String(rawLocalization)
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    let parsed;

    try {
        parsed = JSON.parse(cleaned);
    } catch (error) {
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");

        if (firstBrace === -1 || lastBrace <= firstBrace) {
            throw new Error("Kimi returned invalid tooth localization JSON.");
        }

        try {
            parsed = JSON.parse(
                cleaned.substring(firstBrace, lastBrace + 1)
            );
        } catch (innerError) {
            throw new Error("Kimi returned invalid tooth localization JSON.");
        }
    }

    const teeth = Array.isArray(parsed?.teeth)
        ? parsed.teeth
        : Array.isArray(parsed?.tooth_targets)
            ? parsed.tooth_targets
            : [];

    if (!Array.isArray(teeth)) {
        throw new Error("Kimi localization did not return a teeth array.");
    }

    return {
        image_width: Number(parsed?.image_width || 0),
        image_height: Number(parsed?.image_height || 0),
        teeth
    };
}


function normalizePreciseToothTargets(
    teeth,
    imageWidth,
    imageHeight
) {
    if (!Array.isArray(teeth)) return [];

    const seen = new Set();
    const normalized = [];

    for (const item of teeth) {
        const tooth = String(item?.tooth || "").trim();

        if (!VALID_FDI_TEETH.has(tooth)) continue;
        if (seen.has(tooth)) continue;
        if (item?.visible === false) continue;

        const bbox = item?.bbox || {};
        const center = item?.center || {};

        let x = Number(bbox.x);
        let y = Number(bbox.y);
        let width = Number(bbox.width);
        let height = Number(bbox.height);

        if (![x, y, width, height].every(Number.isFinite)) {
            continue;
        }

        x = Math.round(Math.max(0, Math.min(imageWidth - 1, x)));
        y = Math.round(Math.max(0, Math.min(imageHeight - 1, y)));
        width = Math.round(Math.max(1, Math.min(imageWidth - x, width)));
        height = Math.round(Math.max(1, Math.min(imageHeight - y, height)));

        let centerX = Number(center.x);
        let centerY = Number(center.y);

        if (!Number.isFinite(centerX)) {
            centerX = x + width / 2;
        }

        if (!Number.isFinite(centerY)) {
            centerY = y + height / 2;
        }

        centerX = Math.round(Math.max(0, Math.min(imageWidth - 1, centerX)));
        centerY = Math.round(Math.max(0, Math.min(imageHeight - 1, centerY)));

        const confidence = Math.max(
            0,
            Math.min(1, Number(item?.confidence ?? 0))
        );

        normalized.push({
            tooth,
            label: String(item?.label || ""),
            visible: true,
            analyzable: item?.analyzable === true,
            confidence,
            center: {
                x: centerX,
                y: centerY
            },
            bbox: {
                x,
                y,
                width,
                height
            },
            reason: String(item?.reason || "")
        });

        seen.add(tooth);
    }

    return normalized;
}


// ============================================================
// API: PRECISE TOOTH LOCALIZATION
// ============================================================

app.post(
    "/api/tooth-localize",
    upload.single("image"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: "Please upload the original smile photograph."
                });
            }

            const metadata = await sharp(req.file.buffer).metadata();
            const imageWidth = Number(metadata.width || 0);
            const imageHeight = Number(metadata.height || 0);

            if (!imageWidth || !imageHeight) {
                return res.status(400).json({
                    success: false,
                    error: "Unable to determine image dimensions."
                });
            }

            const localization = await localizeTeethWithKimi(
                req.file.buffer,
                req.file.mimetype
            );

            const targets = normalizePreciseToothTargets(
                localization.teeth,
                imageWidth,
                imageHeight
            );

            console.log("");
            console.log("KIMI PRECISE LOCALIZATION COMPLETE");
            console.log("Analyzable teeth:", targets.filter(t => t.analyzable).map(t => t.tooth));
            console.log("All visible targets:", targets.map(t => ({
                tooth: t.tooth,
                analyzable: t.analyzable,
                confidence: t.confidence
            })));

            return res.json({
                success: true,
                image: {
                    width: imageWidth,
                    height: imageHeight
                },
                teeth: targets
            });
        } catch (error) {
            console.error(
                "Precise tooth localization error:",
                error.response?.data || error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to localize individual teeth."
            });
        }
    }
);


// ============================================================
// API: SELECTED TOOTH ANALYSIS
// ============================================================

app.post(
    "/api/tooth-analyze",
    upload.single("image"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: "Please upload the original smile photograph."
                });
            }

            const tooth = String(req.body.tooth || "").trim();

            if (!VALID_FDI_TEETH.has(tooth)) {
                return res.status(400).json({
                    success: false,
                    error: "A valid FDI tooth number is required."
                });
            }

            let target;

            try {
                target = JSON.parse(req.body.target || "{}");
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid precise tooth target."
                });
            }

            if (!target || typeof target !== "object") {
                return res.status(400).json({
                    success: false,
                    error: "Precise tooth localization target is missing."
                });
            }

            if (String(target.tooth || "") !== tooth) {
                return res.status(400).json({
                    success: false,
                    error: "Selected tooth does not match the localization target."
                });
            }

            if (target.analyzable !== true) {
                return res.status(422).json({
                    success: false,
                    code: "TOOTH_NOT_ANALYZABLE",
                    error:
                        target.reason ||
                        `Kimi did not mark tooth ${tooth} as individually analyzable.`
                });
            }

            if (!target.bbox || !target.center) {
                return res.status(400).json({
                    success: false,
                    error: "The selected tooth has no valid localization data."
                });
            }

            let report = null;

            if (req.body.report) {
                try {
                    report = normalizeReport(
                        JSON.parse(req.body.report)
                    );
                } catch (error) {
                    console.log(
                        "Optional full smile report could not be parsed. Continuing with precise target."
                    );
                }
            }

            console.log("");
            console.log("========================================");
            console.log("KIMI SELECTED TOOTH VERIFICATION");
            console.log("========================================");
            console.log("FDI:", tooth);
            console.log("Target:", JSON.stringify(target, null, 2));

            const toothReport = await analyzeSelectedTooth(
                req.file.buffer,
                req.file.mimetype,
                target,
                report
            );

            if (
                !toothReport?.success ||
                toothReport?.analyzable === false
            ) {
                return res.status(422).json({
                    success: false,
                    code: "TOOTH_NOT_VERIFIED",
                    error:
                        toothReport?.reason ||
                        `Kimi could not independently verify tooth ${tooth}.`
                });
            }

            if (String(toothReport.tooth || "") !== tooth) {
                return res.status(422).json({
                    success: false,
                    code: "TOOTH_MISMATCH",
                    error:
                        `Kimi returned tooth ${toothReport.tooth || "unknown"} instead of FDI ${tooth}.`
                });
            }

            const referenceBuffer =
                await createToothReferenceImage(
                    req.file.buffer,
                    target
                );

            return res.json({
                success: true,
                tooth,
                target,
                toothReport,
                referenceImage:
                    "data:image/jpeg;base64," +
                    referenceBuffer.toString("base64")
            });
        } catch (error) {
            console.error(
                "Selected tooth analysis error:",
                error.response?.data || error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to analyze the selected tooth."
            });
        }
    }
);


// ============================================================
// API: SELECTED TOOTH VISUALIZATION
// ============================================================

app.post(
    "/api/tooth-visualize",
    upload.single("image"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: "Please upload the original smile photograph."
                });
            }

            const tooth = String(req.body.tooth || "").trim();

            if (!VALID_FDI_TEETH.has(tooth)) {
                return res.status(400).json({
                    success: false,
                    error: "A valid FDI tooth number is required."
                });
            }

            let payload;

            try {
                payload = JSON.parse(req.body.payload || "{}");
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid selected-tooth payload."
                });
            }

            const target = payload.target;
            const toothReport = payload.toothReport;

            if (
                !target ||
                String(target.tooth) !== tooth ||
                !target.bbox ||
                !target.center
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Selected tooth location data is missing or invalid."
                });
            }

            if (
                !toothReport?.success ||
                toothReport?.analyzable === false
            ) {
                return res.status(422).json({
                    success: false,
                    error: "A verified tooth-specific Kimi report is required before visualization."
                });
            }

            console.log("");
            console.log("========================================");
            console.log("ISOLATED TOOTH VISUALIZATION");
            console.log("========================================");
            console.log("Tooth:", tooth);
            console.log("Target:", JSON.stringify(target, null, 2));
            console.log("Tooth report:", JSON.stringify(toothReport, null, 2));

            // 1. Keep the full annotated reference image for the dentist/UI.
            const referenceBuffer =
                await createToothReferenceImage(
                    req.file.buffer,
                    target
                );

            // 2. Create a small editing crop from the ORIGINAL photograph.
            //    The annotated reference is NOT sent to MAI anymore.
            const cropInfo =
                await createIsolatedToothEditingCrop(
                    req.file.buffer,
                    target
                );

            console.log("MAI editing crop:", {
                left: cropInfo.left,
                top: cropInfo.top,
                width: cropInfo.width,
                height: cropInfo.height,
                toothX: cropInfo.toothX,
                toothY: cropInfo.toothY,
                toothWidth: cropInfo.toothWidth,
                toothHeight: cropInfo.toothHeight
            });

            // 3. MAI edits only the isolated crop.
            const prompt = buildToothVisualizationPrompt(
                target,
                toothReport
            );

            const imageResult =
                await generateToothVisualization(
                    cropInfo.buffer,
                    "image/jpeg",
                    prompt
                );

            const generatedImage =
                extractGeneratedImage(imageResult);

            if (!generatedImage) {
                throw new Error(
                    "Pollinations returned no selected-tooth visualization."
                );
            }

            // 4. Convert MAI output to bytes.
            const generatedCropBuffer =
                await generatedImageToBuffer(generatedImage);

            // 5. Composite ONLY the Kimi-localized tooth region back onto
            //    the ORIGINAL photograph. Everything else remains original.
            const finalBuffer =
                await compositeIsolatedToothOntoOriginal(
                    req.file.buffer,
                    generatedCropBuffer,
                    cropInfo
                );

            const finalImage =
                "data:image/jpeg;base64," +
                finalBuffer.toString("base64");

            console.log("Isolated tooth visualization complete.");
            console.log("Only the selected FDI region was composited onto the original image.");

            return res.json({
                success: true,
                tooth,
                generatedImage: finalImage,
                referenceImage:
                    "data:image/jpeg;base64," +
                    referenceBuffer.toString("base64")
            });

        } catch (error) {
            console.error(
                "Selected tooth visualization error:",
                error.response?.data || error.message
            );

            return res.status(500).json({
                success: false,
                error:
                    error.response?.data?.error?.message ||
                    error.response?.data?.error ||
                    error.message ||
                    "Unable to generate the selected-tooth visualization."
            });
        }
    }
);

// API: TOOTH MASK
// ============================================================

app.post(
    "/api/tooth-mask",
    upload.single("image"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: "No image uploaded."
                });
            }

            const tooth = String(
                req.body.tooth || ""
            ).trim();

            if (!tooth) {
                return res.status(400).json({
                    success: false,
                    error: "Tooth number is required."
                });
            }

            let report;

            try {
                report = JSON.parse(
                    req.body.report || "{}"
                );
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid report JSON."
                });
            }

            const toothTargets = Array.isArray(
                report.tooth_targets
            )
                ? report.tooth_targets
                : [];

            const target = toothTargets.find(
                item => String(item?.tooth) === tooth
            );

            if (!target?.bbox) {
                return res.status(404).json({
                    success: false,
                    error:
                        `Tooth ${tooth} was not found in tooth_targets or has no bbox.`
                });
            }

            const metadata = await sharp(
                req.file.buffer
            ).metadata();

            const imageWidth = metadata.width;
            const imageHeight = metadata.height;

            if (!imageWidth || !imageHeight) {
                return res.status(400).json({
                    success: false,
                    error: "Unable to determine image dimensions."
                });
            }

            const bbox = target.bbox;

            const originalX = Math.max(
                0,
                Math.min(
                    imageWidth - 1,
                    Math.round((Number(bbox.x) / 1000) * imageWidth)
                )
            );

            const originalY = Math.max(
                0,
                Math.min(
                    imageHeight - 1,
                    Math.round((Number(bbox.y) / 1000) * imageHeight)
                )
            );

            const originalWidth = Math.max(
                1,
                Math.min(
                    imageWidth - originalX,
                    Math.round((Number(bbox.width) / 1000) * imageWidth)
                )
            );

            const originalHeight = Math.max(
                1,
                Math.min(
                    imageHeight - originalY,
                    Math.round((Number(bbox.height) / 1000) * imageHeight)
                )
            );

            const paddingX = Math.max(
                5,
                Math.round(originalWidth * 0.25)
            );

            const paddingY = Math.max(
                6,
                Math.round(originalHeight * 0.25)
            );

            const cropLeft = Math.max(
                0,
                originalX - paddingX
            );

            const cropTop = Math.max(
                0,
                originalY - paddingY
            );

            const cropRight = Math.min(
                imageWidth,
                originalX + originalWidth + paddingX
            );

            const cropBottom = Math.min(
                imageHeight,
                originalY + originalHeight + paddingY
            );

            const cropWidth = Math.max(
                1,
                cropRight - cropLeft
            );

            const cropHeight = Math.max(
                1,
                cropBottom - cropTop
            );

            console.log("Tooth segmentation:", {
                tooth,
                imageWidth,
                imageHeight,
                bbox,
                originalPixelBox: {
                    x: originalX,
                    y: originalY,
                    width: originalWidth,
                    height: originalHeight
                },
                cropBox: {
                    x: cropLeft,
                    y: cropTop,
                    width: cropWidth,
                    height: cropHeight
                }
            });

            const {
                data,
                info
            } = await sharp(req.file.buffer)
                .extract({
                    left: cropLeft,
                    top: cropTop,
                    width: cropWidth,
                    height: cropHeight
                })
                .removeAlpha()
                .raw()
                .toBuffer({
                    resolveWithObject: true
                });

            const width = info.width;
            const height = info.height;
            const channels = info.channels;

            let mask = new Uint8Array(
                width * height
            );

            // First-pass tooth segmentation.
            // This is intentionally conservative; it will be tuned
            // after inspecting the actual debug crop.
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const index =
                        (y * width + x) * channels;

                    const r = data[index];
                    const g = data[index + 1];
                    const b = data[index + 2];

                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);

                    const brightness = max;
                    const saturation = max - min;

                    const isBright =
                        brightness >= 125;

                    const isLowSaturation =
                        saturation <= 95;

                    const isWarmWhite =
                        r >= b - 5;

                    if (
                        isBright &&
                        isLowSaturation &&
                        isWarmWhite
                    ) {
                        mask[y * width + x] = 255;
                    }
                }
            }

            mask = morphologyClose(
                mask,
                width,
                height,
                1
            );

            mask = morphologyOpen(
                mask,
                width,
                height,
                1
            );

            const targetCenterX =
                originalX -
                cropLeft +
                originalWidth / 2;

            const targetCenterY =
                originalY -
                cropTop +
                originalHeight / 2;

            mask = keepBestComponent(
                mask,
                width,
                height,
                targetCenterX,
                targetCenterY
            );

            mask = morphologyClose(
                mask,
                width,
                height,
                1
            );

            const cropMaskBuffer = await sharp(
                Buffer.from(mask),
                {
                    raw: {
                        width,
                        height,
                        channels: 1
                    }
                }
            )
                .png()
                .toBuffer();

            const fullMaskRaw = Buffer.alloc(
                imageWidth * imageHeight
            );

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const fullX = cropLeft + x;
                    const fullY = cropTop + y;

                    if (
                        fullX >= 0 &&
                        fullX < imageWidth &&
                        fullY >= 0 &&
                        fullY < imageHeight
                    ) {
                        fullMaskRaw[
                            fullY * imageWidth + fullX
                        ] =
                            mask[y * width + x];
                    }
                }
            }

            const fullMaskBuffer = await sharp(
                fullMaskRaw,
                {
                    raw: {
                        width: imageWidth,
                        height: imageHeight,
                        channels: 1
                    }
                }
            )
                .png()
                .toBuffer();

            const overlayRaw = Buffer.alloc(
                imageWidth *
                imageHeight *
                4
            );

            for (let i = 0; i < fullMaskRaw.length; i++) {
                const value = fullMaskRaw[i];
                const index = i * 4;

                overlayRaw[index] = 255;
                overlayRaw[index + 1] = 0;
                overlayRaw[index + 2] = 0;
                overlayRaw[index + 3] =
                    Math.round(value * 0.45);
            }

            const overlayBuffer = await sharp(
                overlayRaw,
                {
                    raw: {
                        width: imageWidth,
                        height: imageHeight,
                        channels: 4
                    }
                }
            )
                .png()
                .toBuffer();

            const previewBuffer = await sharp(
                req.file.buffer
            )
                .composite([
                    {
                        input: overlayBuffer,
                        blend: "over"
                    }
                ])
                .jpeg({
                    quality: 92
                })
                .toBuffer();

            const debugOverlayRaw = Buffer.alloc(
                width * height * 4
            );

            for (let i = 0; i < mask.length; i++) {
                const value = mask[i];
                const index = i * 4;

                debugOverlayRaw[index] = 255;
                debugOverlayRaw[index + 1] = 0;
                debugOverlayRaw[index + 2] = 0;
                debugOverlayRaw[index + 3] =
                    Math.round(value * 0.55);
            }

            const debugOverlayBuffer = await sharp(
                debugOverlayRaw,
                {
                    raw: {
                        width,
                        height,
                        channels: 4
                    }
                }
            )
                .png()
                .toBuffer();

            const debugCropBuffer = await sharp(
                req.file.buffer
            )
                .extract({
                    left: cropLeft,
                    top: cropTop,
                    width: cropWidth,
                    height: cropHeight
                })
                .composite([
                    {
                        input: debugOverlayBuffer,
                        blend: "over"
                    }
                ])
                .jpeg({
                    quality: 95
                })
                .toBuffer();

            return res.json({
                success: true,
                tooth,
                bbox,

                pixelBox: {
                    x: originalX,
                    y: originalY,
                    width: originalWidth,
                    height: originalHeight
                },

                cropBox: {
                    x: cropLeft,
                    y: cropTop,
                    width: cropWidth,
                    height: cropHeight
                },

                mask:
                    "data:image/png;base64," +
                    fullMaskBuffer.toString("base64"),

                preview:
                    "data:image/jpeg;base64," +
                    previewBuffer.toString("base64"),

                debugCrop:
                    "data:image/jpeg;base64," +
                    debugCropBuffer.toString("base64")
            });

        } catch (error) {
            console.error(
                "Tooth mask error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Failed to create tooth mask."
            });
        }
    }
);

// API: GENERATE

// ============================================================



app.post(

    [
        "/api/generate",
        "/api/generate/pre"
    ],

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