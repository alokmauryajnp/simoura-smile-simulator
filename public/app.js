/* =========================================================
       STATE
    ========================================================= */

let selectedFile = null;

let analysisReport = null;

// Precise tooth analysis is available only after
// the full smile analysis has completed successfully.
let fullSmileAnalysisComplete = false;

let originalImageUrl = null;

let generatedImageUrl = null;
// Original upload is retained for initial analysis; generated design is the active canvas for precise-tooth work.
let activeDesignFile = null;
let smileVisualizationComplete = false;

// Custom refinement state for the full-smile visualization.
let refinementCount = 0;
let refinementBusy = false;
let refinementPromptPanel = null;
let refinementPromptInput = null;
let refineSmileBtn = null;
let refinementStatus = null;

function ensureSmileRefinementUI() {
    if (!resultSection || refinementPromptPanel?.isConnected) return;

    refinementPromptPanel = document.createElement("section");
    refinementPromptPanel.id = "simouraSmileRefinementPanel";
    refinementPromptPanel.style.cssText = [
        "margin-top:24px",
        "padding:24px",
        "border:1px solid #d8e6e0",
        "border-radius:16px",
        "background:#ffffff",
        "box-sizing:border-box"
    ].join(";");

    const heading = document.createElement("h3");
    heading.textContent = "Customize Your Smile";
    heading.style.cssText = "margin:0 0 8px;color:#164b43;font-size:24px;";
    const description = document.createElement("p");
    description.textContent = "Describe what you would like to adjust in this visualization. You can refine it more than once.";
    description.style.cssText = "margin:0 0 16px;color:#526a65;line-height:1.55;";

    refinementPromptInput = document.createElement("textarea");
    refinementPromptInput.id = "simouraSmileCustomPrompt";
    refinementPromptInput.maxLength = 1200;
    refinementPromptInput.rows = 4;
    refinementPromptInput.placeholder = "Example: Make the two upper front teeth slightly wider and whiten all visible teeth by one natural shade.";
    refinementPromptInput.setAttribute("aria-label", "Custom smile refinement instructions");
    refinementPromptInput.style.cssText = "display:block;width:100%;min-height:110px;box-sizing:border-box;padding:14px;border:1px solid #cbded8;border-radius:10px;font:inherit;line-height:1.5;resize:vertical;background:#fff;color:#183b35;";

    const helper = document.createElement("p");
    helper.textContent = "Be specific. Changes are AI-generated visual suggestions and may not match clinically achievable results.";
    helper.style.cssText = "margin:8px 0 14px;color:#6b7d78;font-size:13px;line-height:1.5;";

    const suggestions = document.createElement("div");
    suggestions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;";
    const promptSuggestions = [
        "Whiten the visible teeth by one natural shade",
        "Make the two upper front teeth slightly wider",
        "Make the two upper front teeth slightly longer",
        "Make all the upper front teeth slightly longer",
        "Make all the upper teeth slightly longer",
        "Make all the lower front teeth slightly longer",
        "Make the overall smile appear a little wider",
        "Keep the changes subtle and natural"
    ];
    promptSuggestions.forEach(text => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.textContent = text;
        chip.style.cssText = "border:1px solid #cbded8;border-radius:999px;padding:8px 12px;background:#f5faf7;color:#24584e;font:inherit;font-size:13px;cursor:pointer;";
        chip.addEventListener("click", () => {
            if (!refinementPromptInput) return;
            refinementPromptInput.value = text;
            refinementPromptInput.focus();
        });
        suggestions.appendChild(chip);
    });

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:12px;";
    refineSmileBtn = document.createElement("button");
    refineSmileBtn.type = "button";
    refineSmileBtn.textContent = "Apply Changes";
    refineSmileBtn.style.cssText = "border:0;border-radius:8px;padding:12px 20px;background:#164b43;color:#fff;font:inherit;font-weight:600;cursor:pointer;";
    refineSmileBtn.addEventListener("click", refineSmileVisualization);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear prompt";
    clearBtn.style.cssText = "border:1px solid #cbded8;border-radius:8px;padding:11px 16px;background:#fff;color:#24584e;font:inherit;cursor:pointer;";
    clearBtn.addEventListener("click", () => {
        if (refinementPromptInput) refinementPromptInput.value = "";
    });

    refinementStatus = document.createElement("p");
    refinementStatus.setAttribute("role", "status");
    refinementStatus.setAttribute("aria-live", "polite");
    refinementStatus.style.cssText = "display:none;margin:14px 0 0;color:#526a65;line-height:1.5;";

    actions.append(refineSmileBtn, clearBtn);
    refinementPromptPanel.append(heading, description, refinementPromptInput, helper, suggestions, actions, refinementStatus);
    resultSection.appendChild(refinementPromptPanel);
}

function setRefinementStatus(message, isError = false) {
    if (!refinementStatus) return;
    refinementStatus.textContent = message;
    refinementStatus.style.display = message ? "block" : "none";
    refinementStatus.style.color = isError ? "#a12b2b" : "#526a65";
}

async function refineSmileVisualization() {
    if (refinementBusy) return;
    const customPrompt = String(refinementPromptInput?.value || "").trim();
    if (!customPrompt) {
        setRefinementStatus("Please describe the change you want first.", true);
        refinementPromptInput?.focus();
        return;
    }
    if (customPrompt.length > 1200) {
        setRefinementStatus("Please keep your instruction under 1,200 characters.", true);
        return;
    }
    if (!generatedImageUrl) {
        setRefinementStatus("Generate a smile visualization before customizing it.", true);
        return;
    }

    refinementBusy = true;
    refineSmileBtn.disabled = true;
    refineSmileBtn.textContent = "Applying Changes…";
    setRefinementStatus("Applying your instructions to the current visualization. This may take a little while.");
    statusText.textContent = "Refining smile visualization";
    generationProgress.classList.add("visible");
    generationProgress.scrollIntoView({ behavior: "smooth", block: "center" });

    try {
        const formData = new FormData();
        formData.append("currentImage", generatedImageUrl);
        formData.append("report", JSON.stringify(analysisReport || {}));
        formData.append("customPrompt", customPrompt);
        formData.append("refine", "true");

        const response = await fetch("/api/generate", {
            method: "POST",
            body: formData
        });
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error("The server returned an invalid response while refining the image.");
        }
        if (!response.ok || !data.success || !data.generatedImage) {
            throw new Error(data.error || "Unable to refine the smile visualization.");
        }

        generatedImageUrl = data.generatedImage;
        activeDesignFile = await imageUrlToFile(generatedImageUrl, "simoura-generated-smile.png");
        smileVisualizationComplete = true;
        resetPreciseToothWorkflow(false);
        updatePreciseToothButtonState();
        preciseLocalizationStatus.textContent =
            "Smile design updated. Re-run precise tooth analysis because the generated image has changed.";
        afterImage.src = generatedImageUrl;
        refinementCount += 1;
        refinementPromptInput.value = "";
        setRefinementStatus(`Updated visualization ready${refinementCount > 1 ? ` (refinement ${refinementCount})` : ""}. You can enter another instruction to refine it again.`);
        statusText.textContent = "Visualization updated";
        resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        console.error("SMILE REFINEMENT ERROR:", error);
        setRefinementStatus(error.message || "Unable to refine the smile visualization.", true);
        statusText.textContent = "Refinement failed";
    } finally {
        generationProgress.classList.remove("visible");
        refinementBusy = false;
        if (refineSmileBtn) {
            refineSmileBtn.disabled = false;
            refineSmileBtn.textContent = "Apply Changes";
        }
    }
}



async function imageUrlToFile(imageUrl, filename = "simoura-generated-smile.png") {
    if (!imageUrl) throw new Error("The generated smile image is missing.");
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Could not load the generated smile image for precise analysis.");
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("The generated smile response is not a valid image.");
    const extension = blob.type.includes("jpeg") || blob.type.includes("jpg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png";
    return new File([blob], filename.replace(/\.(png|jpe?g|webp)$/i, "") + "." + extension, { type: blob.type, lastModified: Date.now() });
}


/* =========================================================
   ELEMENTS
========================================================= */

const fileInput =
    document.getElementById(
        "fileInput"
    );

const uploadZone =
    document.getElementById(
        "uploadZone"
    );

const previewSection =
    document.getElementById(
        "previewSection"
    );

const previewImage =
    document.getElementById(
        "previewImage"
    );

const fileThumbnail =
    document.getElementById(
        "fileThumbnail"
    );

const fileName =
    document.getElementById(
        "fileName"
    );

const fileMeta =
    document.getElementById(
        "fileMeta"
    );

const analyzeBtn =
    document.getElementById(
        "analyzeBtn"
    );

const changeImageBtn =
    document.getElementById(
        "changeImageBtn"
    );

const removeImageBtn =
    document.getElementById(
        "removeImageBtn"
    );

const processing =
    document.getElementById(
        "processing"
    );

const processingText =
    document.getElementById(
        "processingText"
    );

const errorBox =
    document.getElementById(
        "errorBox"
    );

const reportSection =
    document.getElementById(
        "reportSection"
    );

const generationCard =
    document.getElementById(
        "generationCard"
    );

const generationAction =
    document.getElementById(
        "generationAction"
    );

const generationProgress =
    document.getElementById(
        "generationProgress"
    );

const qualityWarning =
    document.getElementById(
        "qualityWarning"
    );

const warningList =
    document.getElementById(
        "warningList"
    );

const generateBtn =
    document.getElementById(
        "generateBtn"
    );

const resultSection =
    document.getElementById(
        "resultSection"
    );

const beforeImage =
    document.getElementById(
        "beforeImage"
    );

const afterImage =
    document.getElementById(
        "afterImage"
    );

const statusText =
    document.getElementById(
        "statusText"
    );

const toothSelect =
    document.getElementById(
        "toothSelect"
    );

const testToothMaskBtn =
    document.getElementById(
        "testToothMaskBtn"
    );

const toothMaskMeta =
    document.getElementById(
        "toothMaskMeta"
    );

const toothMaskResult =
    document.getElementById(
        "toothMaskResult"
    );

const toothMaskPreview =
    document.getElementById(
        "toothMaskPreview"
    );

const toothMaskStatus =
    document.getElementById(
        "toothMaskStatus"
    );

const toothAnalysisStatus =
    document.getElementById(
        "toothAnalysisStatus"
    );

const toothAnalysisReport =
    document.getElementById(
        "toothAnalysisReport"
    );

const visualizeToothBtn =
    document.getElementById(
        "visualizeToothBtn"
    );

const startPreciseToothBtn =
    document.getElementById(
        "startPreciseToothBtn"
    );

const preciseLocalizationStatus =
    document.getElementById(
        "preciseLocalizationStatus"
    );

const toothVisualizationPreview =
    document.getElementById(
        "toothVisualizationPreview"
    );


// The HTML uses #toothVisualizationPreview as a container <div>,
// not as an <img>. Render generated images inside that container.
function clearToothVisualizationPreview() {
    if (!toothVisualizationPreview) return;
    toothVisualizationPreview.replaceChildren();
    toothVisualizationPreview.style.display = "none";
}

function renderToothVisualizationPreview(imageUrl, toothNumber) {
    if (!toothVisualizationPreview || !imageUrl) {
        throw new Error("The server did not return a tooth visualization image.");
    }

    const image = document.createElement("img");
    image.alt = `AI visualization of tooth ${toothNumber}`;
    image.style.display = "block";
    image.style.width = "100%";
    image.style.maxWidth = "100%";
    image.style.height = "auto";
    image.style.maxHeight = "720px";
    image.style.objectFit = "contain";
    image.style.borderRadius = "12px";
    image.style.border = "1px solid #d8e6e0";
    image.style.background = "#f0f6f3";

    image.onload = () => {
        toothVisualizationPreview.style.display = "block";
        toothVisualizationPreview.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    };
    image.onerror = () => {
        clearToothVisualizationPreview();
        showError("The tooth visualization was generated, but the image could not be displayed.");
    };

    toothVisualizationPreview.replaceChildren(image);
    toothVisualizationPreview.style.display = "block";
    image.src = imageUrl;
}

let selectedToothReport = null;
let selectedToothTarget = null;

// Additive shape-variant selection state. Existing tooth-selection and
// analysis state remain unchanged.
let selectedShapeVariantId = "";
let shapeVariantRequestToken = 0;
let toothShapeVariantGrid = null;
let toothShapeVariantStatus = null;


// Precise workflow state is intentionally separate from the
// normal full-smile analysis report.
let preciseToothTargets = [];
let preciseLocalizationReady = false;



updatePreciseToothButtonState();


/* =========================================================
   UPLOAD
========================================================= */

uploadZone.addEventListener(
    "click",
    event => {
        // The associated Choose Photo label already opens the input.
        // Do not trigger it a second time when that click bubbles on iOS.
        if (event.target.closest("label, input, button, a")) {
            return;
        }

        fileInput.click();
    }
);


fileInput.addEventListener(
    "change",
    async event => {
        const input = event.currentTarget;
        const file = input.files?.[0];

        if (!file) {
            return;
        }

        try {
            await handleFile(file);
        } catch (error) {
            console.error("PHOTO UPLOAD ERROR:", error);
            showError(error?.message || "The photo could not be loaded. Please try taking the photo again or choose it from Photos.");
        } finally {
            // Allows selecting/capturing the same photo again on iOS.
            input.value = "";
        }
    }
);


uploadZone.addEventListener(
    "dragover",
    event => {

        event.preventDefault();

        uploadZone.classList.add(
            "dragover"
        );

    }
);


uploadZone.addEventListener(
    "dragleave",
    () => {

        uploadZone.classList.remove(
            "dragover"
        );

    }
);


uploadZone.addEventListener(
    "drop",
    async event => {

        event.preventDefault();

        uploadZone.classList.remove(
            "dragover"
        );

        const file =
            event.dataTransfer
                ?.files?.[0];

        if (!file) {
            return;
        }

        await handleFile(
            file
        );

    }
);


/* =========================================================
   LARGE IMAGE OPTIMIZATION
   Trigger: uploaded file is larger than 1 MB.
   Converts to JPEG and limits the longest edge to 2200 px,
   preserving enough detail for tooth localization.
========================================================= */

// HEIC/HEIF is common for iPhone photos, but Safari/Chrome do not expose
// reliable canvas decoding for these formats on every device. Load the
// browser-side decoder only when a HEIC/HEIF file is selected.
let heicToLoaderPromise = null;

async function loadHeicTo() {
    if (typeof window.HeicTo === "function") return window.HeicTo;

    if (!heicToLoaderPromise) {
        heicToLoaderPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-simoura-heic-decoder="true"]');
            const script = existing || document.createElement("script");
            // Use the actively maintained libheif-based decoder instead of the
            // older heic2any decoder, which can render some iPhone HEIC photos
            // as separate red/green/blue panels.
            script.src = "https://cdn.jsdelivr.net/npm/heic-to@1.6.6/dist/iife/heic-to.js";
            script.async = true;
            script.dataset.simouraHeicDecoder = "true";
            script.onload = () => typeof window.HeicTo === "function"
                ? resolve(window.HeicTo)
                : reject(new Error("The HEIC/HEIF decoder loaded but was unavailable."));
            script.onerror = () => reject(new Error("Could not load the HEIC/HEIF image decoder. Check your internet connection and try again."));
            if (!existing) document.head.appendChild(script);
            else if (typeof window.HeicTo === "function") resolve(window.HeicTo);
        });
    }
    return heicToLoaderPromise;
}

function isHeicOrHeif(file) {
    const name = (file?.name || "").toLowerCase();
    const type = (file?.type || "").toLowerCase();
    return /\.(heic|heif)$/.test(name) || type === "image/heic" || type === "image/heif" || type === "image/heic-sequence" || type === "image/heif-sequence";
}

async function convertHeicToJpeg(file) {
    const heicTo = await loadHeicTo();
    const jpegBlob = await heicTo({
        blob: file,
        type: "image/jpeg",
        quality: 0.92
    });
    if (!(jpegBlob instanceof Blob) || !jpegBlob.size || jpegBlob.type !== "image/jpeg") {
        throw new Error("HEIC/HEIF conversion did not produce a valid JPEG image.");
    }

    // Confirm the decoded output is a real image before allowing it into the
    // preview. This prevents a broken decoder result from being shown as if it
    // were a valid uploaded photo.
    const testUrl = URL.createObjectURL(jpegBlob);
    try {
        await new Promise((resolve, reject) => {
            const testImage = new Image();
            testImage.onload = () => testImage.naturalWidth > 0 && testImage.naturalHeight > 0
                ? resolve()
                : reject(new Error("Converted HEIC image has invalid dimensions."));
            testImage.onerror = () => reject(new Error("Converted HEIC image could not be decoded as JPEG."));
            testImage.src = testUrl;
        });
    } finally {
        URL.revokeObjectURL(testUrl);
    }

    const baseName = (file.name || "iphone-photo").replace(/\.[^.]+$/, "") || "iphone-photo";
    return new File([jpegBlob], `${baseName}-converted.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now()
    });
}

async function optimizeUploadedImage(file) {

    const MAX_EDGE = 2200;
    const JPEG_QUALITY = 0.86;

    // Decode HEIC/HEIF explicitly before handing the image to createImageBitmap
    // or canvas. This also handles iPhone files whose MIME type is blank but
    // whose filename has a .heic/.heif extension.
    if (isHeicOrHeif(file)) {
        file = await convertHeicToJpeg(file);
    }

    let bitmap;
    let sourceWidth;
    let sourceHeight;
    let drawSource;

    if (typeof createImageBitmap === "function") {
        bitmap = await createImageBitmap(file);
        sourceWidth = bitmap.width;
        sourceHeight = bitmap.height;
        drawSource = bitmap;
    } else {
        const imageUrl = URL.createObjectURL(file);
        try {
            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error("The uploaded image could not be decoded."));
                img.src = imageUrl;
            });
            sourceWidth = image.naturalWidth;
            sourceHeight = image.naturalHeight;
            drawSource = image;
        } finally {
            URL.revokeObjectURL(imageUrl);
        }
    }

    try {
        if (!sourceWidth || !sourceHeight) {
            throw new Error("The uploaded image has invalid dimensions.");
        }

        const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
            throw new Error("Could not initialize image compression.");
        }

        // A white background avoids black/transparent backgrounds when PNGs
        // with transparency are converted to JPEG.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(drawSource, 0, 0, width, height);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                result => result
                    ? resolve(result)
                    : reject(new Error("JPEG conversion failed.")),
                "image/jpeg",
                JPEG_QUALITY
            );
        });

        // Always return JPEG, even when it is larger than the source. This
        // normalizes browser-decodable formats (including PNG, WebP, GIF
        // frames, BMP, TIFF where supported, and iPhone formats where the
        // browser can decode them) before any backend/API receives the image.
        const baseName = file.name.replace(/\.[^.]+$/, "") || "smile-photo";
        return new File(
            [blob],
            `${baseName}-converted.jpg`,
            { type: "image/jpeg", lastModified: Date.now() }
        );
    } finally {
        if (bitmap && typeof bitmap.close === "function") {
            bitmap.close();
        }
    }
}


async function handleFile(file) {

    clearError();

    // Some iOS versions provide an empty or generic MIME type for camera
    // files, so also trust known image extensions (including HEIC/HEIF).
    const imageName = (file.name || "").toLowerCase();
    const looksLikeImage = (file.type || "").toLowerCase().startsWith("image/") ||
        /\.(jpe?g|png|webp|gif|bmp|tiff?|avif|heic|heif|dng|raw)$/.test(imageName);
    if (!looksLikeImage) {
        showError("Please choose an image file from your camera or photo library.");
        return;
    }


    // Normalize every upload to JPEG before preview/analysis, regardless of
    // file size or source format. This prevents unsupported originals (for
    // example, a browser-readable HEIC/AVIF) from reaching the backend as-is.
    let fileForAnalysis;
    let wasOptimized = false;

    try {
        fileForAnalysis = await optimizeUploadedImage(file);
        wasOptimized = true;
    } catch (conversionError) {
        console.error("Image conversion failed:", conversionError);
        showError(
            isHeicOrHeif(file)
                ? "The iPhone HEIC/HEIF photo could not be converted. Check your internet connection and try again, or choose Most Compatible/JPEG in iPhone Settings > Camera > Formats."
                : "This image format could not be decoded by this browser. Try a JPEG/PNG image, or convert the original to JPEG first."
        );
        return;
    }

    selectedFile = fileForAnalysis;
    clearPreciseFdiPhotoMarkers();

    if (originalImageUrl) {

        URL.revokeObjectURL(
            originalImageUrl
        );

    }


    originalImageUrl =
        URL.createObjectURL(
            fileForAnalysis
        );


    previewImage.src =
        originalImageUrl;

    fileThumbnail.src =
        originalImageUrl;


    const dimensions =
        await getImageDimensions(
            fileForAnalysis
        );


    fileName.textContent =
        wasOptimized
            ? `${file.name} (converted to JPG)`
            : file.name;


    if (
        dimensions.width &&
        dimensions.height
    ) {

        fileMeta.textContent =
            `${formatBytes(fileForAnalysis.size)} · ${dimensions.width} × ${dimensions.height} px` +
            (wasOptimized
                ? ` · converted from ${formatBytes(file.size)}`
                : "");

    } else {

        fileMeta.textContent =
            `${formatBytes(fileForAnalysis.size)}` +
            (wasOptimized
                ? ` · converted from ${formatBytes(file.size)}`
                : "");

    }


    previewSection.classList.add(
        "visible"
    );
    // Remove the initial hidden class so legacy UI state observers
    // recognize that an image is actually available.
    previewSection.classList.remove("hidden");


    analyzeBtn.disabled =
        false;

    // A new image invalidates the previous full-smile analysis.
    fullSmileAnalysisComplete = false;

    startPreciseToothBtn.disabled = true;
    preciseLocalizationStatus.textContent =
        "Complete the full smile analysis before starting precise tooth analysis.";


    analysisReport = null;

    generatedImageUrl = null;
    activeDesignFile = null;
    smileVisualizationComplete = false;
    refinementCount = 0;
    if (refinementPromptInput) refinementPromptInput.value = "";
    setRefinementStatus("");


    resetToothMaskUI();


    reportSection.classList.remove(
        "visible"
    );

    generationCard.classList.remove(
        "visible"
    );

    resultSection.classList.remove(
        "visible"
    );

    generationProgress.classList.remove(
        "visible"
    );

    qualityWarning.classList.remove(
        "visible"
    );


    statusText.textContent =
        "Image ready for analysis";


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


/* =========================================================
   IMAGE DIMENSIONS
========================================================= */

function getImageDimensions(file) {

    return new Promise(
        resolve => {

            const img =
                new Image();

            const url =
                URL.createObjectURL(
                    file
                );

            img.onload =
                () => {

                    URL.revokeObjectURL(
                        url
                    );

                    resolve({
                        width:
                            img.naturalWidth,

                        height:
                            img.naturalHeight
                    });

                };

            img.onerror =
                () => {

                    URL.revokeObjectURL(
                        url
                    );

                    resolve({
                        width: 0,
                        height: 0
                    });

                };

            img.src =
                url;

        }
    );

}


/* =========================================================
   CHANGE IMAGE
========================================================= */

changeImageBtn.addEventListener(
    "click",
    () => {

        fileInput.click();

    }
);


removeImageBtn.addEventListener(
    "click",
    () => {

        resetApplication();

    }
);


/* =========================================================
   ANALYZE
========================================================= */

analyzeBtn.addEventListener(
    "click",
    analyzeSmile
);


async function analyzeSmile() {

    if (!selectedFile) {

        showError(
            "Please upload a smile photograph first."
        );

        return;
    }


    clearError();

    // While full smile analysis is running, precise analysis
    // must remain unavailable.
    fullSmileAnalysisComplete = false;
    startPreciseToothBtn.disabled = true;

    setProcessing(
        true,
        "Analyzing visible smile characteristics with Kimi K3..."
    );


    analyzeBtn.disabled =
        true;


    statusText.textContent =
        "AI analysis in progress";


    try {

        const formData =
            new FormData();


        formData.append(
            "image",
            selectedFile
        );


        const response =
            await fetch(
                "/api/analyze",
                {
                    method: "POST",
                    body: formData
                }
            );


        const responseText =
            await response.text();


        console.log(
            "ANALYZE STATUS:",
            response.status
        );

        console.log(
            "ANALYZE CONTENT TYPE:",
            response.headers.get(
                "content-type"
            )
        );

        console.log(
            "ANALYZE RESPONSE:",
            responseText
        );


        let data;


        try {

            data =
                JSON.parse(
                    responseText
                );

        } catch (parseError) {

            throw new Error(
                `Server returned a non-JSON response:\n\n${responseText.substring(0, 700)}`
            );

        }


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.error ||
                "Smile analysis failed."
            );

        }


        analysisReport =
            data.report;


        console.log(
            "FRESH ANALYSIS REPORT USED BY FRONTEND:",
            JSON.stringify(
                analysisReport,
                null,
                2
            )
        );


        // Kimi full smile analysis is complete.
        // Precise tooth analysis becomes available RIGHT NOW.
        // It must NOT wait for Pollinations / smile visualization.
        fullSmileAnalysisComplete = true;
        smileVisualizationComplete = false;

        resetPreciseToothWorkflow(false);

        updatePreciseToothButtonState();
        preciseLocalizationStatus.textContent =
            "Generate the initial smile design first. Precise tooth analysis will run on that generated result.";


        renderReport(
            analysisReport
        );


        reportSection.classList.add(
            "visible"
        );
        // Remove the initial hidden class so legacy UI state observers
        // recognize that Kimi analysis is complete.
        reportSection.classList.remove("hidden");

        generationCard.classList.add(
            "visible"
        );


        updateVisualizationAvailability(
            analysisReport
        );


        setProcessing(
            false
        );


        statusText.textContent =
            "AI analysis ready";


        setTimeout(
            () => {

                generationCard.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

            },
            250
        );


    } catch (error) {

        console.error(
            "ANALYZE ERROR:",
            error
        );


        showError(
            error.message ||
            "Unable to analyze the smile."
        );


        setProcessing(
            false
        );


        statusText.textContent =
            "Analysis failed";

    } finally {

        analyzeBtn.disabled =
            false;

    }

}



/* =========================================================
   PRECISE TOOTH AI WORKFLOW
========================================================= */

function populateToothTargets(targets) {

    preciseToothTargets = Array.isArray(targets)
        ? targets.filter(target =>
            target &&
            target.visible !== false &&
            target.analyzable === true &&
            target.bbox &&
            target.center
        )
        : [];

    toothSelect.innerHTML = "";
    selectedToothReport = null;
    selectedToothTarget = null;
    visualizeToothBtn.disabled = true;
    toothMaskResult.classList.remove("visible");
    clearToothReferenceArea();
    clearToothVisualizationPreview();
    toothAnalysisStatus.textContent = "";
    toothAnalysisReport.textContent = "";
    toothMaskStatus.textContent = "";

    if (!preciseToothTargets.length) {
        toothSelect.disabled = true;
        testToothMaskBtn.disabled = true;
        toothSelect.innerHTML =
            "<option value=\"\">No Kimi-approved analyzable teeth found</option>";
        toothMaskMeta.textContent =
            "Kimi did not return any teeth that it considered sufficiently visible and individually analyzable.";
        return;
    }

    preciseToothTargets.forEach(target => {
        const option = document.createElement("option");
        option.value = String(target.tooth);
        option.textContent =
            `${target.tooth}${target.label ? " — " + target.label : ""}`;
        toothSelect.appendChild(option);
    });

    toothSelect.disabled = false;
    testToothMaskBtn.disabled = false;
    updateSelectedToothMeta();
    renderGapClosureToothChoices();
}


/* =========================================================
   CLICKABLE FDI PHOTO IN THE PRECISION SECTION
   Render the uploaded photo here (not only in Patient Photo),
   with Kimi's tooth centers as clickable FDI markers.
========================================================= */

let preciseFdiPhotoPanel = null;
let preciseFdiImage = null;
let preciseFdiMarkerLayer = null;
let preciseWorkspace = null;
let preciseWorkspaceLeft = null;
let preciseWorkspaceRight = null;
let preciseWorkspacePlaceholder = null;

// Crown measurement UI removed as requested.


function ensurePrecisionWorkspace(photoPanel, startRow) {
    if (preciseWorkspace && preciseWorkspace.isConnected) {
        return;
    }

    const section = startPreciseToothBtn?.closest(".adv-panel");
    const selectionRow = toothSelect?.closest(".row");
    if (!section || !startRow || !selectionRow || !toothMaskResult) return;

    const styleId = "simoura-precision-two-column-layout";
    if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
                #precisionToothWorkspace {
                    display: grid;
                    grid-template-columns: minmax(0, 1.18fr) minmax(0, 0.92fr);
                    align-items: start;
                    gap: 24px;
                    margin-top: 20px;
                }
                #precisionToothWorkspace .precision-workspace-column {
                    min-width: 0;
                    padding: 22px;
                    border: 1px solid #d8e6e8;
                    border-radius: 14px;
                    background: #fff;
                    box-sizing: border-box;
                }
                #precisionToothWorkspace #preciseFdiPhotoPanel {
                    margin: 0 !important;
                    padding: 0 !important;
                    border: 0 !important;
                    border-radius: 0 !important;
                    background: transparent !important;
                }
                #precisionToothWorkspace #preciseFdiPhoto {
                    width: 100%;
                    height: auto;
                    max-height: 560px;
                    object-fit: contain;
                }
                #precisionToothWorkspace .precision-tooth-controls {
                    display: grid !important;
                    grid-template-columns: minmax(0, 1fr) auto;
                    align-items: end;
                    gap: 12px;
                    margin-top: 18px;
                    width: 100%;
                }
                #precisionToothWorkspace .precision-tooth-controls > div {
                    display: block;
                    flex: initial;
                    width: 100%;
                    min-width: 0;
                }
                #precisionToothWorkspace .precision-tooth-controls select {
                    display: block;
                    width: 100%;
                    max-width: 100%;
                    box-sizing: border-box;
                }
                #precisionToothWorkspace .precision-tooth-controls > button {
                    position: static !important;
                    float: none !important;
                    align-self: end;
                    margin: 0 !important;
                    white-space: nowrap;
                    max-width: 100%;
                }
                #precisionToothWorkspace .precision-workspace-right > h3 {
                    margin: 0 0 14px;
                }
                #precisionToothWorkspace #toothMaskResult {
                    margin: 0 !important;
                    min-width: 0;
                }
                /* The right column already has its own persistent reference heading.
                   Hide the duplicate heading retained inside the original result markup. */
                #precisionToothWorkspace #toothMaskResult > .up > div:first-child > h3 {
                    display: none !important;
                }
                #precisionToothWorkspace #toothMaskResult > .up {
                    display: block;
                }
                #precisionToothWorkspace #toothMaskResult > .up > div + div {
                    margin-top: 22px;
                }
                #precisionToothWorkspace #toothMaskImageArea,
                #precisionToothWorkspace #toothMaskPreview {
                    max-width: 100%;
                }
                #precisionToothWorkspace #toothMaskMeta {
                    white-space: pre-line;
                    overflow-wrap: anywhere;
                    margin-bottom: 12px;
                }
                #precisionToothWorkspace #toothVisualizationPreview {
                    overflow: hidden;
                }
                #precisionToothWorkspace .precision-workspace-placeholder {
                    min-height: 300px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    padding: 28px;
                    border: 1px dashed #cbded8;
                    border-radius: 12px;
                    background: #f6faf8;
                    color: #52716b;
                    box-sizing: border-box;
                }
                #precisionToothWorkspace .precision-workspace-placeholder strong {
                    display: block;
                    color: #164b43;
                    margin-bottom: 8px;
                }
                @media (max-width: 900px) {
                    #precisionToothWorkspace {
                        grid-template-columns: minmax(0, 1fr);
                        gap: 16px;
                    }
                    #precisionToothWorkspace .precision-workspace-column {
                        padding: 16px;
                    }
                    #precisionToothWorkspace .precision-workspace-placeholder {
                        min-height: 180px;
                    }
                }
                @media (max-width: 560px) {
                    #precisionToothWorkspace .precision-tooth-controls {
                        grid-template-columns: minmax(0, 1fr);
                    }
                    #precisionToothWorkspace .precision-tooth-controls > button {
                        width: 100%;
                        white-space: normal;
                    }
                }
            `;
        document.head.appendChild(style);
    }

    const workspace = document.createElement("div");
    workspace.id = "precisionToothWorkspace";
    const left = document.createElement("div");
    left.className = "precision-workspace-column precision-workspace-left";
    const right = document.createElement("div");
    right.className = "precision-workspace-column precision-workspace-right";
    const referenceHeading = document.createElement("h3");
    referenceHeading.className = "precision-reference-heading";
    referenceHeading.textContent = "AI Tooth Localization Reference";
    referenceHeading.style.cssText = "margin:0 0 14px;font-family:'Cormorant Garamond',Georgia,serif;font-size:27px;line-height:1.15;color:#123f38;";

    const placeholder = document.createElement("div");
    placeholder.className = "precision-workspace-placeholder";
    placeholder.innerHTML = "<strong>Tooth reference will appear here</strong><span>Click a numbered FDI marker to analyze a tooth and view its verification image.</span>";

    workspace.append(left, right);
    right.append(referenceHeading, placeholder, toothMaskResult);
    startRow.insertAdjacentElement("afterend", workspace);
    left.append(photoPanel, selectionRow);

    // Keep the selected-tooth report full-width below the photo/reference
    // columns instead of squeezing the detailed assessment into the right column.
    const analysisColumn = toothAnalysisReport?.parentElement;
    const analysisPanel = document.createElement("section");
    analysisPanel.id = "precisionToothAnalysisPanel";
    analysisPanel.style.cssText = "display:none;width:100%;margin:24px 0 0;padding:24px;border:1px solid #d8e6e8;border-radius:14px;background:#fff;box-sizing:border-box;";
    const analysisHeading = document.createElement("h3");
    analysisHeading.textContent = "Selected Tooth Analysis";
    analysisHeading.style.cssText = "margin:0 0 16px;";
    analysisPanel.appendChild(analysisHeading);
    if (toothAnalysisStatus) analysisPanel.appendChild(toothAnalysisStatus);
    if (toothAnalysisReport) analysisPanel.appendChild(toothAnalysisReport);

    // Shape selection is additive: it sits inside the existing selected-tooth
    // analysis panel and does not replace any existing controls.
    const shapeVariantPanel = document.createElement("section");
    shapeVariantPanel.id = "toothShapeVariantPanel";
    shapeVariantPanel.style.cssText = "display:none;width:100%;margin:22px 0 0;padding:18px;border:1px solid #d8e6e0;border-radius:12px;background:#f8fbf9;box-sizing:border-box;";

    const shapeVariantHeading = document.createElement("h4");
    shapeVariantHeading.textContent = "Choose Tooth Shape";
    shapeVariantHeading.style.cssText = "margin:0 0 6px;color:#164b43;font-size:18px;";

    const shapeVariantHelp = document.createElement("p");
    shapeVariantHelp.textContent = "Choose a reference shape for this tooth. Only variants configured in the FDI reference library will appear here.";
    shapeVariantHelp.style.cssText = "margin:0 0 12px;color:#60736d;font-size:13px;line-height:1.5;";

    toothShapeVariantStatus = document.createElement("p");
    toothShapeVariantStatus.id = "toothShapeVariantStatus";
    toothShapeVariantStatus.setAttribute("role", "status");
    toothShapeVariantStatus.style.cssText = "margin:0 0 12px;color:#60736d;font-size:13px;line-height:1.5;";

    toothShapeVariantGrid = document.createElement("div");
    toothShapeVariantGrid.id = "toothShapeVariantGrid";
    toothShapeVariantGrid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;";

    shapeVariantPanel.append(shapeVariantHeading, shapeVariantHelp, toothShapeVariantStatus, toothShapeVariantGrid);

    // Dentist-specified target dimensions for the selected-tooth visualization.
    // Values guide visual proportions; generated pixels are not guaranteed clinical mm.
    const desiredDimensionsPanel = document.createElement("section");
    desiredDimensionsPanel.id = "desiredToothDimensionsPanel";
    desiredDimensionsPanel.style.cssText = "width:100%;margin-top:22px;padding:16px;border:1px solid #d8e6e0;border-radius:12px;background:#f8fbf9;box-sizing:border-box;";
    const desiredDimensionsHeading = document.createElement("h4");
    desiredDimensionsHeading.textContent = "Desired Crown Dimensions (Optional)";
    desiredDimensionsHeading.style.cssText = "margin:0 0 6px;color:#164b43;font-size:18px;";
    const desiredDimensionsHelp = document.createElement("p");
    desiredDimensionsHelp.textContent = "Enter the target clinical crown height and width in millimetres. With a calibrated pixels-per-mm scale, the backend converts these values into target pixels. The image model may still deviate, so the result must be measured again.";
    desiredDimensionsHelp.style.cssText = "margin:0 0 12px;color:#60736d;font-size:13px;line-height:1.5;";
    const desiredDimensionsRow = document.createElement("div");
    desiredDimensionsRow.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;";
    const desiredCrownHeightLabel = document.createElement("label");
    desiredCrownHeightLabel.htmlFor = "desiredCrownHeightMm";
    desiredCrownHeightLabel.textContent = "Target height (mm)";
    desiredCrownHeightLabel.style.cssText = "display:flex;flex-direction:column;gap:6px;color:#164b43;font-size:13px;font-weight:600;";
    const desiredCrownHeightInput = document.createElement("input");
    desiredCrownHeightInput.id = "desiredCrownHeightMm";
    desiredCrownHeightInput.type = "number";
    desiredCrownHeightInput.min = "1";
    desiredCrownHeightInput.max = "30";
    desiredCrownHeightInput.step = "0.1";
    desiredCrownHeightInput.placeholder = "e.g. 10.5";
    desiredCrownHeightInput.inputMode = "decimal";
    desiredCrownHeightInput.style.cssText = "width:100%;box-sizing:border-box;padding:11px;border:1px solid #cbded8;border-radius:8px;background:#fff;color:#183b35;font:inherit;";
    desiredCrownHeightLabel.appendChild(desiredCrownHeightInput);
    const desiredCrownWidthLabel = document.createElement("label");
    desiredCrownWidthLabel.htmlFor = "desiredCrownWidthMm";
    desiredCrownWidthLabel.textContent = "Target width (mm)";
    desiredCrownWidthLabel.style.cssText = desiredCrownHeightLabel.style.cssText;
    const desiredCrownWidthInput = document.createElement("input");
    desiredCrownWidthInput.id = "desiredCrownWidthMm";
    desiredCrownWidthInput.type = "number";
    desiredCrownWidthInput.min = "1";
    desiredCrownWidthInput.max = "30";
    desiredCrownWidthInput.step = "0.1";
    desiredCrownWidthInput.placeholder = "e.g. 8.5";
    desiredCrownWidthInput.inputMode = "decimal";
    desiredCrownWidthInput.style.cssText = desiredCrownHeightInput.style.cssText;
    desiredCrownWidthLabel.appendChild(desiredCrownWidthInput);
    desiredDimensionsRow.append(desiredCrownHeightLabel, desiredCrownWidthLabel);

    const pixelsPerMmLabel = document.createElement("label");
    pixelsPerMmLabel.htmlFor = "pixelsPerMmCalibration";
    pixelsPerMmLabel.textContent = "Calibration scale (pixels per mm, optional)";
    pixelsPerMmLabel.style.cssText = desiredCrownHeightLabel.style.cssText;
    const pixelsPerMmInput = document.createElement("input");
    pixelsPerMmInput.id = "pixelsPerMmCalibration";
    pixelsPerMmInput.type = "number";
    pixelsPerMmInput.min = "0.1";
    pixelsPerMmInput.max = "1000";
    pixelsPerMmInput.step = "0.01";
    pixelsPerMmInput.placeholder = "e.g. 18.66 from calibration";
    pixelsPerMmInput.inputMode = "decimal";
    pixelsPerMmInput.style.cssText = desiredCrownHeightInput.style.cssText;
    pixelsPerMmLabel.appendChild(pixelsPerMmInput);
    const calibrationHelp = document.createElement("p");
    calibrationHelp.textContent = "Enter a scale measured from a known reference in the same photograph. Without calibration, mm targets are guidance only; pixel targets use the selected mask's approximate dimensions.";
    calibrationHelp.style.cssText = "grid-column:1/-1;margin:0;color:#60736d;font-size:12px;line-height:1.45;";
    desiredDimensionsRow.append(pixelsPerMmLabel, calibrationHelp);

    // Relative size controls let the dentist adjust the visible tooth even when
    // calibrated physical millimetre measurements are not available.
    const sizeAdjustments = document.createElement("div");
    sizeAdjustments.id = "toothSizeAdjustmentControls";
    sizeAdjustments.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:18px;padding-top:16px;border-top:1px solid #d8e6e0;";
    function createSizeAdjustmentControl(labelText, id, outputId) {
        const group = document.createElement("label");
        group.style.cssText = "display:flex;flex-direction:column;gap:8px;color:#164b43;font-size:13px;font-weight:600;";
        const header = document.createElement("span");
        header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;";
        const label = document.createElement("span");
        label.textContent = labelText;
        const output = document.createElement("output");
        output.id = outputId;
        output.textContent = "100%";
        output.style.cssText = "font-variant-numeric:tabular-nums;color:#164b43;font-weight:700;";
        header.append(label, output);
        const range = document.createElement("input");
        range.id = id;
        range.type = "range";
        range.min = "70";
        range.max = "130";
        range.step = "1";
        range.value = "100";
        range.setAttribute("aria-label", labelText + " relative to current tooth size");
        range.style.cssText = "width:100%;accent-color:#164b43;cursor:pointer;";
        range.addEventListener("input", () => { output.textContent = `${range.value}%`; });
        const scaleHint = document.createElement("span");
        scaleHint.textContent = "70% smaller  ·  100% unchanged  ·  130% larger";
        scaleHint.style.cssText = "font-size:11px;font-weight:400;color:#71817c;";
        group.append(header, range, scaleHint);
        return group;
    }
    sizeAdjustments.append(
        createSizeAdjustmentControl("Height adjustment", "desiredCrownHeightScale", "desiredCrownHeightScaleValue"),
        createSizeAdjustmentControl("Width adjustment", "desiredCrownWidthScale", "desiredCrownWidthScaleValue")
    );
    const sizeResetButton = document.createElement("button");
    sizeResetButton.type = "button";
    sizeResetButton.textContent = "Reset size to 100%";
    sizeResetButton.style.cssText = "grid-column:1/-1;justify-self:start;padding:8px 12px;border:1px solid #cbded8;border-radius:8px;background:#fff;color:#164b43;font:inherit;font-size:12px;cursor:pointer;";
    sizeResetButton.addEventListener("click", () => {
        for (const [inputId, outputId] of [["desiredCrownHeightScale", "desiredCrownHeightScaleValue"], ["desiredCrownWidthScale", "desiredCrownWidthScaleValue"]]) {
            const control = document.getElementById(inputId);
            const output = document.getElementById(outputId);
            if (control) control.value = "100";
            if (output) output.textContent = "100%";
        }
    });
    sizeAdjustments.appendChild(sizeResetButton);
    const sizeAdjustmentHelp = document.createElement("p");
    sizeAdjustmentHelp.textContent = "These sliders request a relative visual change from the current tooth. 110% means about 10% larger in that dimension; 90% means about 10% smaller. AI output is approximate, not a calibrated clinical measurement.";
    sizeAdjustmentHelp.style.cssText = "margin:10px 0 0;color:#60736d;font-size:12px;line-height:1.5;";
    desiredDimensionsPanel.append(desiredDimensionsHeading, desiredDimensionsHelp, desiredDimensionsRow, sizeAdjustments, sizeAdjustmentHelp);

    function updateDimensionPreviewHint() {
        const bbox = selectedToothTarget?.bbox;
        const heightRange = document.getElementById("desiredCrownHeightScale");
        const widthRange = document.getElementById("desiredCrownWidthScale");
        const heightOut = document.getElementById("desiredCrownHeightScaleValue");
        const widthOut = document.getElementById("desiredCrownWidthScaleValue");
        if (!heightRange || !widthRange || !heightOut || !widthOut) return;

        const hPct = Number(heightRange.value || 100);
        const wPct = Number(widthRange.value || 100);

        if (bbox?.height && bbox?.width) {
            const targetH = Math.round((bbox.height * hPct) / 100);
            const targetW = Math.round((bbox.width * wPct) / 100);
            heightOut.textContent = `${hPct}% (${bbox.height}px → ${targetH}px)`;
            widthOut.textContent = `${wPct}% (${bbox.width}px → ${targetW}px)`;
        } else {
            heightOut.textContent = `${hPct}%`;
            widthOut.textContent = `${wPct}%`;
        }
    }

    desiredCrownHeightInput.addEventListener("input", updateDimensionPreviewHint);
    desiredCrownWidthInput.addEventListener("input", updateDimensionPreviewHint);
    document.getElementById("desiredCrownHeightScale")?.addEventListener("input", updateDimensionPreviewHint);
    document.getElementById("desiredCrownWidthScale")?.addEventListener("input", updateDimensionPreviewHint);

    // Optional user instructions for the selected-tooth visualization.
    // These supplement Kimi's assessment and must remain limited to this tooth.
    const customPromptGroup = document.createElement("div");
    customPromptGroup.id = "preciseToothCustomPromptGroup";
    customPromptGroup.style.cssText = "width:100%;margin-top:22px;box-sizing:border-box;";

    const customPromptLabel = document.createElement("label");
    customPromptLabel.htmlFor = "preciseToothCustomPrompt";
    customPromptLabel.textContent = "Custom Instructions for This Tooth (Optional)";
    customPromptLabel.style.cssText = "display:block;margin:0 0 8px;color:#164b43;font-weight:600;line-height:1.4;";

    const customPromptHelp = document.createElement("p");
    customPromptHelp.textContent = "Describe the specific change you want for the selected tooth, such as its shape, width, length, alignment, or shade. Keep instructions limited to this tooth.";
    customPromptHelp.style.cssText = "margin:0 0 10px;color:#60736d;font-size:13px;line-height:1.5;";

    const preciseToothCustomPrompt = document.createElement("textarea");
    preciseToothCustomPrompt.id = "preciseToothCustomPrompt";
    preciseToothCustomPrompt.maxLength = 1200;
    preciseToothCustomPrompt.rows = 4;
    preciseToothCustomPrompt.placeholder = "Example: Make this tooth slightly narrower and more naturally aligned with its neighbor. Preserve its natural texture and do not change other teeth.";
    preciseToothCustomPrompt.setAttribute("aria-label", "Custom instructions for selected-tooth visualization");
    preciseToothCustomPrompt.style.cssText = "display:block;width:100%;min-height:105px;box-sizing:border-box;padding:13px;border:1px solid #cbded8;border-radius:10px;background:#fff;color:#183b35;font:inherit;line-height:1.5;resize:vertical;";

    const preciseToothPromptCounter = document.createElement("p");
    preciseToothPromptCounter.id = "preciseToothCustomPromptCount";
    preciseToothPromptCounter.textContent = "0 / 1200 characters";
    preciseToothPromptCounter.style.cssText = "margin:6px 0 0;text-align:right;color:#71817c;font-size:12px;";
    preciseToothCustomPrompt.addEventListener("input", () => {
        preciseToothPromptCounter.textContent = `${preciseToothCustomPrompt.value.length} / 1200 characters`;
    });

    customPromptGroup.append(customPromptLabel, customPromptHelp, preciseToothCustomPrompt, preciseToothPromptCounter);
    analysisPanel.appendChild(shapeVariantPanel);
    analysisPanel.appendChild(desiredDimensionsPanel);
    analysisPanel.appendChild(customPromptGroup);

    if (visualizeToothBtn) {
        visualizeToothBtn.style.marginTop = "18px";
        analysisPanel.appendChild(visualizeToothBtn);
    }
    workspace.insertAdjacentElement("afterend", analysisPanel);

    if (analysisColumn) {
        analysisColumn.style.display = "none";
    }
    const layoutStyle = document.getElementById("simoura-precision-two-column-layout");
    if (layoutStyle && !layoutStyle.textContent.includes("#precisionToothAnalysisPanel")) {
        layoutStyle.textContent += `
                #precisionToothAnalysisPanel #toothAnalysisReport {
                    width: 100%;
                    max-width: none;
                    margin: 0;
                }
                #precisionToothAnalysisPanel .tooth-report-card {
                    width: 100%;
                    max-width: none;
                    margin: 0;
                }
                #precisionToothAnalysisPanel .tooth-report-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                @media (max-width: 700px) {
                    #precisionToothAnalysisPanel { padding: 16px; }
                    #precisionToothAnalysisPanel .tooth-report-grid {
                        grid-template-columns: minmax(0, 1fr);
                    }
                }
            `;
    }

    preciseWorkspace = workspace;
    preciseWorkspaceLeft = left;
    preciseWorkspaceRight = right;
    preciseWorkspacePlaceholder = placeholder;
    selectionRow.classList.add("precision-tooth-controls");
    if (!window.__simouraToothReportObserver && (toothAnalysisReport || toothAnalysisStatus)) {
        window.__simouraToothReportObserver = new MutationObserver(() => syncPrecisionWorkspace());
        if (toothAnalysisReport) window.__simouraToothReportObserver.observe(toothAnalysisReport, { childList: true, subtree: true, characterData: true });
        if (toothAnalysisStatus) window.__simouraToothReportObserver.observe(toothAnalysisStatus, { childList: true, subtree: true, characterData: true });
    }
    syncPrecisionWorkspace();
}

function syncPrecisionWorkspace() {
    if (!preciseWorkspacePlaceholder || !toothMaskResult) return;
    const resultVisible = toothMaskResult.classList.contains("visible");
    preciseWorkspacePlaceholder.style.display = resultVisible ? "none" : "flex";
    const analysisPanel = document.getElementById("precisionToothAnalysisPanel");
    if (analysisPanel) {
        // Do not show an empty full-width report card during the loading phase.
        // Reveal it when actual report content exists, or when a non-loading
        // status (for example an error) needs to be shown to the user.
        const hasReport = Boolean(toothAnalysisReport?.textContent?.trim());
        const statusText = String(toothAnalysisStatus?.textContent || "").trim();
        const isLoadingStatus = /independently verifying|analyzing tooth|preparing the fdi reference/i.test(statusText);
        const hasNonLoadingStatus = Boolean(statusText) && !isLoadingStatus;
        analysisPanel.style.display = (hasReport || hasNonLoadingStatus) ? "block" : "none";
    }
}

function ensurePreciseFdiPhotoPanel() {
    if (preciseFdiPhotoPanel && preciseFdiPhotoPanel.isConnected) {
        return preciseFdiPhotoPanel;
    }

    const section = startPreciseToothBtn?.closest(".adv-panel");
    const startRow = startPreciseToothBtn?.closest(".precise-start-row");
    if (!section || !startRow) return null;

    const panel = document.createElement("div");
    panel.id = "preciseFdiPhotoPanel";
    panel.style.cssText = "display:none;margin:22px 0 26px;padding:16px;border:1px solid #d8e6e0;border-radius:14px;background:#fff;";

    const heading = document.createElement("h3");
    heading.textContent = "Select a tooth on the photo";
    heading.style.cssText = "margin:0 0 6px;";

    const note = document.createElement("p");
    note.textContent = "Click a numbered FDI marker to start that tooth's precise analysis. You can still use the dropdown below.";
    note.style.cssText = "margin:0 0 14px;";
    note.className = "note";

    const frame = document.createElement("div");
    frame.style.cssText = "position:relative;width:100%;max-width:900px;margin:0 auto;line-height:0;overflow:hidden;border-radius:10px;background:#f0f6f3;";

    const image = document.createElement("img");
    image.id = "preciseFdiPhoto";
    image.alt = "Generated smile design with clickable FDI tooth markers";
    image.style.cssText = "display:block;width:100%;height:auto;max-height:none;object-fit:contain;";

    const layer = document.createElement("div");
    layer.id = "preciseFdiMarkerLayer";
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;";

    frame.append(image, layer);
    panel.append(heading, note, frame);

    preciseFdiPhotoPanel = panel;
    preciseFdiImage = image;
    preciseFdiMarkerLayer = layer;
    image.addEventListener("load", () => {
        if (preciseLocalizationReady && preciseToothTargets.length) {
            renderPreciseFdiPhotoMarkers();
        }
    });
    ensurePrecisionWorkspace(panel, startRow);
    return panel;
}

function renderPreciseFdiPhotoMarkers() {
    const panel = ensurePreciseFdiPhotoPanel();
    if (!panel || !preciseFdiImage || !preciseFdiMarkerLayer) return;

    if (!activeDesignFile || !generatedImageUrl || !preciseLocalizationReady || !preciseToothTargets.length) {
        panel.style.display = "none";
        preciseFdiMarkerLayer.replaceChildren();
        return;
    }

    if (preciseFdiImage.src !== generatedImageUrl) {
        preciseFdiImage.src = generatedImageUrl;
    }
    panel.style.display = "block";
    preciseFdiMarkerLayer.replaceChildren();

    // Only display clickable FDI markers when Kimi's normalized
    // confidence is strictly greater than 75% (backend scale: 0 to 1).
    const highConfidenceTargets = preciseToothTargets.filter(target => {
        const confidence = Number(target?.confidence);
        return Number.isFinite(confidence) && confidence > 0.75;
    });

    preciseFdiMarkerLayer.replaceChildren();

    if (!highConfidenceTargets.length) {
        const notice = document.createElement("p");
        notice.textContent = "No teeth exceeded the 75% confidence threshold. Use the dropdown below if you want to inspect other detected teeth.";
        notice.style.cssText = "position:relative;z-index:4;margin:12px;padding:12px 14px;border-radius:10px;background:#fff7e6;color:#7a4b00;font-size:14px;line-height:1.4;text-align:center;";
        preciseFdiMarkerLayer.style.pointerEvents = "none";
        panel.style.display = "block";
        // Keep the notice in the marker layer without adding any FDI labels.
        preciseFdiMarkerLayer.appendChild(notice);
        return;
    }

    highConfidenceTargets.forEach(target => {
        const x = Number(target?.center?.x);
        const y = Number(target?.center?.y);
        const width = Number(preciseFdiImage.naturalWidth || previewImage.naturalWidth);
        const height = Number(preciseFdiImage.naturalHeight || previewImage.naturalHeight);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !width || !height) return;

        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "precise-fdi-marker";
        marker.textContent = String(target.tooth);
        marker.setAttribute("aria-label", `Analyze tooth ${target.tooth}${target.label ? `, ${target.label}` : ""}`);
        marker.title = `Click to analyze tooth ${target.tooth}`;
        marker.dataset.tooth = String(target.tooth);
        marker.style.cssText = [
            "position:absolute",
            `left:${Math.max(0, Math.min(100, x / width * 100))}%`,
            `top:${Math.max(0, Math.min(100, y / height * 100))}%`,
            "transform:translate(-50%,-50%)",
            "pointer-events:auto",
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "min-width:38px",
            "height:38px",
            "padding:0 7px",
            "border:2px solid #fff",
            "border-radius:999px",
            "background:#087f8c",
            "color:#fff",
            "font-size:13px",
            "font-weight:700",
            "line-height:1",
            "box-shadow:0 2px 8px rgba(0,0,0,.25)",
            "cursor:pointer",
            "z-index:2"
        ].join(";");

        marker.addEventListener("mouseenter", () => {
            marker.style.filter = "brightness(1.12)";
            marker.style.transform = "translate(-50%,-50%) scale(1.08)";
        });
        marker.addEventListener("mouseleave", () => {
            marker.style.filter = "none";
            marker.style.transform = "translate(-50%,-50%)";
        });
        marker.addEventListener("click", async () => {
            if (!preciseLocalizationReady || testToothMaskBtn.disabled) return;
            toothSelect.value = String(target.tooth);
            toothSelect.dispatchEvent(new Event("change", { bubbles: true }));
            updatePreciseFdiMarkerStyles();
            await analyzeSelectedToothFromUI();
        });
        preciseFdiMarkerLayer.appendChild(marker);
    });

    updatePreciseFdiMarkerStyles();
}

function updatePreciseFdiMarkerStyles() {
    if (!preciseFdiMarkerLayer) return;
    const selected = String(toothSelect?.value || "");
    preciseFdiMarkerLayer.querySelectorAll(".precise-fdi-marker").forEach(marker => {
        const isSelected = marker.dataset.tooth === selected;
        marker.style.background = isSelected ? "#f59e0b" : "#087f8c";
        marker.style.color = isSelected ? "#173b36" : "#fff";
        marker.style.zIndex = isSelected ? "3" : "2";
    });
}

function clearPreciseFdiPhotoMarkers() {
    if (preciseFdiPhotoPanel) preciseFdiPhotoPanel.style.display = "none";
    if (preciseFdiMarkerLayer) preciseFdiMarkerLayer.replaceChildren();
}

function getSelectedToothTarget() {

    const tooth = String(toothSelect.value || "").trim();

    return preciseToothTargets.find(
        target => String(target?.tooth) === tooth
    ) || null;
}


function updateSelectedToothMeta() {

    const target = getSelectedToothTarget();

    if (!target) {
        toothMaskMeta.textContent =
            "No Kimi-approved analyzable tooth selected.";
        return;
    }

    const bbox = target.bbox || {};
    const center = target.center || {};

    toothMaskMeta.textContent =
        `Tooth ${target.tooth}${target.label ? " — " + target.label : ""}\n` +
        `Kimi confidence: ${Number(target.confidence || 0).toFixed(2)}\n` +
        `Kimi center: (${center.x}, ${center.y}) pixels\n` +
        `Kimi bbox: x=${bbox.x}, y=${bbox.y}, width=${bbox.width}, height=${bbox.height}`;
}


function resetPreciseToothWorkflow(keepButtonState = false) {

    preciseToothTargets = [];
    preciseLocalizationReady = false;
    selectedToothReport = null;
    selectedToothTarget = null;
    resetToothShapeVariantSelection();

    toothSelect.innerHTML =
        "<option value=\"\">Start precise analysis first</option>";
    toothSelect.disabled = true;
    testToothMaskBtn.disabled = true;
    visualizeToothBtn.disabled = true;
    if (gapClosureChoices) gapClosureChoices.replaceChildren();
    if (gapClosureButton) gapClosureButton.disabled = true;
    if (gapClosureStatus) gapClosureStatus.textContent = "";

    toothMaskMeta.textContent =
        "No precise tooth localization has been performed yet.";
    clearToothReferenceArea();
    clearToothVisualizationPreview();
    toothMaskStatus.textContent = "";
    toothAnalysisStatus.textContent = "";
    toothAnalysisReport.textContent = "";
    toothMaskResult.classList.remove("visible");
    clearToothMaskReview();
    syncPrecisionWorkspace();
    clearPreciseFdiPhotoMarkers();

    if (!keepButtonState) {
        startPreciseToothBtn.disabled =
            !(activeDesignFile && smileVisualizationComplete && fullSmileAnalysisComplete);

        preciseLocalizationStatus.textContent =
            activeDesignFile && smileVisualizationComplete && fullSmileAnalysisComplete
                ? "Smile design generated. You can now analyze and customize individual teeth on this design."
                : selectedFile && fullSmileAnalysisComplete
                    ? "Generate the initial smile design first. Precise tooth analysis will use the generated result."
                    : selectedFile
                        ? "Complete the full smile analysis, then generate a smile design."
                        : "Upload an image to begin.";
    }
}


/* =========================================================
   PRECISE BUTTON STATE
   Precise tooth analysis runs on the generated smile design.
========================================================= */

function updatePreciseToothButtonState() {

    if (!startPreciseToothBtn) return;

    const ready =
        Boolean(activeDesignFile) &&
        Boolean(generatedImageUrl) &&
        Boolean(smileVisualizationComplete) &&
        Boolean(fullSmileAnalysisComplete) &&
        Boolean(analysisReport);

    startPreciseToothBtn.disabled = !ready;
    startPreciseToothBtn.classList.toggle("disabled", !ready);

}


startPreciseToothBtn.addEventListener(
    "click",
    startPreciseToothAnalysis
);


async function startPreciseToothAnalysis() {

    // This workflow depends only on the completed Kimi analysis.
    // Pollinations visualization is completely independent.
    if (!activeDesignFile || !generatedImageUrl || !smileVisualizationComplete) {
        showError("Generate the initial smile design first. Precise tooth analysis runs on the generated design, not the original photograph.");
        return;
    }

    if (!fullSmileAnalysisComplete || !analysisReport) {
        showError("Complete the full smile analysis and generate a smile design before starting precise tooth analysis.");
        return;
    }

    clearError();

    startPreciseToothBtn.disabled = true;
    testToothMaskBtn.disabled = true;
    visualizeToothBtn.disabled = true;
    toothMaskResult.classList.remove("visible");
    preciseLocalizationStatus.textContent =
        "Kimi is locating individually analyzable teeth in the generated smile design...";
    statusText.textContent = "Precise tooth localization in progress";

    try {
        const formData = new FormData();
        formData.append("image", activeDesignFile, activeDesignFile.name);

        const response = await fetch(
            "/api/tooth-localize",
            {
                method: "POST",
                body: formData
            }
        );

        const responseText = await response.text();
        console.log("TOOTH LOCALIZE STATUS:", response.status);
        console.log("TOOTH LOCALIZE RESPONSE:", responseText);

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (error) {
            throw new Error(
                `Server returned a non-JSON response:\n\n${responseText.substring(0, 700)}`
            );
        }

        if (!response.ok || !data.success) {
            throw new Error(
                data.error ||
                "Kimi could not localize the individual teeth."
            );
        }

        populateToothTargets(data.teeth || []);
        preciseLocalizationReady = preciseToothTargets.length > 0;
        renderPreciseFdiPhotoMarkers();

        if (preciseLocalizationReady) {
            const highConfidenceCount = preciseToothTargets.filter(target => {
                const confidence = Number(target?.confidence);
                return Number.isFinite(confidence) && confidence > 0.75;
            }).length;
            preciseLocalizationStatus.textContent =
                `${preciseToothTargets.length} analyzable teeth found. ${highConfidenceCount} tooth${highConfidenceCount === 1 ? "" : "s"} exceeded 75% confidence and will show clickable FDI markers. The dropdown still lists all analyzable teeth.`;
            statusText.textContent = "Precise tooth analysis ready";
        } else {
            preciseLocalizationStatus.textContent =
                "Kimi could not confidently localize any individual tooth for precise analysis.";
            statusText.textContent = "No precise tooth targets found";
        }

    } catch (error) {
        console.error("TOOTH LOCALIZE ERROR:", error);
        preciseLocalizationReady = false;
        preciseLocalizationStatus.textContent =
            "Precise tooth localization failed.";
        showError(
            error.message ||
            "Unable to localize individual teeth."
        );
        statusText.textContent = "Precise localization failed";
    } finally {
        // The button is available only because full smile analysis
        // has already completed. Keep it available so the dentist
        // can retry localization if needed.
        updatePreciseToothButtonState();
    }
}


toothSelect.addEventListener(
    "change",
    () => {
        selectedToothReport = null;
        selectedToothTarget = null;
        resetToothShapeVariantSelection();
        visualizeToothBtn.disabled = true;
        toothMaskResult.classList.remove("visible");
        clearToothReferenceArea();
        clearToothVisualizationPreview();
        toothVisualizationPreview.style.display = "none";
        toothAnalysisStatus.textContent = "";
        toothAnalysisReport.textContent = "";
        toothMaskStatus.textContent = "";
        clearToothMaskReview();
        const customPromptInput = document.getElementById("preciseToothCustomPrompt");
        if (customPromptInput) {
            customPromptInput.value = "";
            const promptCounter = document.getElementById("preciseToothCustomPromptCount");
            if (promptCounter) promptCounter.textContent = "0 / 1200 characters";
        }
        updateSelectedToothMeta();
        updatePreciseFdiMarkerStyles();
    }
);


testToothMaskBtn.addEventListener(
    "click",
    analyzeSelectedToothFromUI
);


/* =========================================================
   TOOTH REFERENCE IMAGE DISPLAY
   The FDI reference image is returned by /api/tooth-analyze.

   IMPORTANT:
   - Every selected-tooth analysis gets a FRESH shimmer element.
   - The previous reference image is removed before a new request.
   - The shimmer remains until the NEW reference image has loaded
     successfully and, when supported, has decoded.
   - Old loading elements are removed so the localization loader
     cannot remain visible after the selected-tooth analysis.
========================================================= */

let toothReferenceLoadToken = 0;


function hideToothReferenceImage() {

    if (!toothMaskPreview) return;

    toothMaskPreview.onload = null;
    toothMaskPreview.onerror = null;
    toothMaskPreview.removeAttribute("src");
    toothMaskPreview.removeAttribute("hidden");
    toothMaskPreview.style.setProperty(
        "display",
        "none",
        "important"
    );
    toothMaskPreview.style.visibility = "hidden";
    toothMaskPreview.style.opacity = "0";

}


function ensureToothReferenceShimmerStyles() {

    const styleId = "simoura-tooth-reference-shimmer-style";

    if (document.getElementById(styleId)) {
        return;
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
            #toothMaskResult {
                position: relative;
                overflow: hidden;
            }

            .tooth-reference-shimmer {
                /*
                 * The existing #toothMaskResult is already the reference
                 * image container and already owns its border/height.
                 * The shimmer must overlay that SAME container instead of
                 * creating a second box underneath it.
                 */
                position: absolute;
                inset: 0;
                z-index: 20;
                width: 100%;
                min-height: 0;
                margin: 0;
                box-sizing: border-box;
                border: 0;
                border-radius: inherit;
                overflow: hidden;
                background: linear-gradient(
                    105deg,
                    #eef5f1 20%,
                    #f8fbf9 38%,
                    #eef5f1 56%
                );
                background-size: 220% 100%;
                animation: simouraToothShimmer 1.5s linear infinite;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .tooth-reference-shimmer-inner {
                width: min(460px, calc(100% - 32px));
                box-sizing: border-box;
                padding: 14px 18px;
                border: 1px solid #d8e5df;
                border-radius: 999px;
                background: rgba(255,255,255,.94);
                box-shadow: 0 10px 28px rgba(18,63,56,.08);
                display: flex;
                align-items: center;
                gap: 12px;
                font-family: inherit;
            }

            .tooth-reference-shimmer-dot {
                width: 9px;
                height: 9px;
                flex: 0 0 9px;
                border-radius: 50%;
                background: #0b806f;
                box-shadow: 0 0 0 6px rgba(11,128,111,.10);
                animation: simouraToothPulse 1.1s ease-in-out infinite;
            }

            .tooth-reference-shimmer-copy {
                min-width: 0;
            }

            .tooth-reference-shimmer-copy strong {
                display: block;
                color: #123f38;
                font-size: 13px;
                line-height: 1.3;
            }

            .tooth-reference-shimmer-copy span {
                display: block;
                margin-top: 3px;
                color: #60736d;
                font-size: 12px;
                line-height: 1.45;
            }

            @keyframes simouraToothShimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -20% 0; }
            }

            @keyframes simouraToothPulse {
                0%,100% { opacity: .45; transform: scale(.9); }
                50% { opacity: 1; transform: scale(1.08); }
            }

            @media (max-width: 700px) {
                .tooth-reference-shimmer {
                    min-height: 240px;
                }

                .tooth-reference-shimmer-inner {
                    border-radius: 16px;
                }
            }
        `;

    document.head.appendChild(style);

}


function removeExistingToothReferenceLoaders() {

    if (!toothMaskResult) return;

    const selectors = [
        "[data-tooth-shimmer]",
        ".tooth-reference-shimmer",
        ".tooth-mask-shimmer",
        ".tooth-localization-shimmer",
        ".tooth-mask-loading",
        ".tooth-reference-loading",
        "[data-tooth-loading]"
    ];

    selectors.forEach(selector => {
        toothMaskResult
            .querySelectorAll(selector)
            .forEach(node => node.remove());
    });

}


function clearToothReferenceLoadingState() {

    if (!toothMaskResult) return;

    removeExistingToothReferenceLoaders();

    // Some older versions of the UI created the localization
    // loading pill without a dedicated class. Remove only the
    // known loading text, never the actual report content.
    toothMaskResult
        .querySelectorAll("div, span, p")
        .forEach(node => {

            const text = (node.textContent || "").trim();

            if (
                text.includes("Analyzing tooth location") ||
                text.includes("Kimi is identifying individually analyzable teeth")
            ) {
                node.remove();
            }

        });

    toothMaskResult.classList.add("tooth-reference-ready");

}


function startToothReferenceLoadingState(toothNumber) {

    if (!toothMaskResult) return;

    // Invalidate every previous image-load callback.
    toothReferenceLoadToken += 1;

    // Remove the previous image and every previous shimmer before
    // creating this run's fresh loading element.
    hideToothReferenceImage();
    removeExistingToothReferenceLoaders();
    toothMaskResult.classList.remove("tooth-reference-ready");

    ensureToothReferenceShimmerStyles();

    const loader = document.createElement("div");
    loader.setAttribute("data-tooth-shimmer", "true");
    loader.className = "tooth-reference-shimmer";
    loader.innerHTML = `
            <div class="tooth-reference-shimmer-inner">
                <span class="tooth-reference-shimmer-dot"></span>
                <div class="tooth-reference-shimmer-copy">
                    <strong>Analyzing tooth ${escapeHtml(toothNumber || "")}</strong>
                    <span>Kimi is independently verifying the selected tooth and preparing the FDI reference...</span>
                </div>
            </div>
        `;

    toothMaskResult.appendChild(loader);

    return toothReferenceLoadToken;

}


function showToothReferenceImage(referenceImage, loadToken = toothReferenceLoadToken) {

    if (!toothMaskPreview) return false;

    if (loadToken !== toothReferenceLoadToken) {
        console.warn("Ignoring stale tooth reference image result.");
        return false;
    }

    if (
        typeof referenceImage !== "string" ||
        !referenceImage.startsWith("data:image/")
    ) {
        console.error(
            "TOOTH REFERENCE IMAGE: invalid referenceImage returned by server."
        );
        clearToothReferenceLoadingState();
        hideToothReferenceImage();
        return false;
    }

    const revealImage = () => {

        if (loadToken !== toothReferenceLoadToken) {
            return;
        }

        toothMaskPreview.style.setProperty(
            "display",
            "block",
            "important"
        );
        toothMaskPreview.style.visibility = "visible";
        toothMaskPreview.style.opacity = "1";

        clearToothReferenceLoadingState();

        console.log(
            "TOOTH REFERENCE IMAGE LOADED:",
            toothMaskPreview.naturalWidth,
            "x",
            toothMaskPreview.naturalHeight
        );

    };

    const failImage = (error) => {

        if (loadToken !== toothReferenceLoadToken) {
            return;
        }

        console.error(
            "TOOTH REFERENCE IMAGE LOAD ERROR:",
            error
        );

        clearToothReferenceLoadingState();
        hideToothReferenceImage();

        toothMaskStatus.textContent =
            "The annotated tooth reference could not be displayed.";

    };

    // Keep the shimmer visible while the NEW image loads.
    toothMaskPreview.onload = revealImage;
    toothMaskPreview.onerror = failImage;

    toothMaskPreview.style.setProperty(
        "display",
        "none",
        "important"
    );
    toothMaskPreview.style.visibility = "hidden";
    toothMaskPreview.style.opacity = "0";
    toothMaskPreview.removeAttribute("hidden");

    // Force a fresh image request even when the browser has already
    // cached/decoded a previous data URL.
    toothMaskPreview.removeAttribute("src");
    toothMaskPreview.src = referenceImage;

    // Data URLs may already be complete immediately after src assignment.
    if (
        toothMaskPreview.complete &&
        toothMaskPreview.naturalWidth > 0
    ) {
        if (typeof toothMaskPreview.decode === "function") {
            toothMaskPreview
                .decode()
                .then(revealImage)
                .catch(() => {
                    // The browser may already have decoded the image;
                    // naturalWidth is the final authority here.
                    if (toothMaskPreview.naturalWidth > 0) {
                        revealImage();
                    } else {
                        failImage("Image decode failed");
                    }
                });
        } else {
            revealImage();
        }
    }

    return true;

}


function clearToothReferenceArea() {

    toothReferenceLoadToken += 1;

    clearToothReferenceLoadingState();
    hideToothReferenceImage();

}


// Tooth-mask review UI: separate from the FDI reference image and measurement tools.
let toothMaskReviewPanel = null;
let toothMaskReviewImage = null;
let toothMaskReviewStatus = null;
let toothMaskReviewButton = null;
let toothMaskReviewToken = 0;

function ensureToothMaskReviewUI() {
    if (toothMaskReviewPanel?.isConnected) return;
    const host = preciseWorkspaceRight || toothMaskResult?.parentElement;
    if (!host) return;
    toothMaskReviewPanel = document.createElement("section");
    toothMaskReviewPanel.id = "simouraToothMaskReview";
    toothMaskReviewPanel.style.cssText = "display:none;margin-top:18px;padding:16px;border:1px solid #d8e5df;border-radius:12px;background:#f8fbf9;box-sizing:border-box;";
    const title = document.createElement("h4");
    title.textContent = "Selected Tooth Mask Preview";
    title.style.cssText = "margin:0 0 6px;color:#123f38;font-size:17px;";
    const help = document.createElement("p");
    help.textContent = "Review the red overlay before visualization. This first-pass mask uses image thresholds and may include reflections or miss tooth edges; it is not a validated segmentation. If the boundary is inaccurate, do not rely on it for precise editing.";
    help.style.cssText = "margin:0 0 12px;color:#60736d;font-size:13px;line-height:1.5;";
    toothMaskReviewButton = document.createElement("button");
    toothMaskReviewButton.type = "button";
    toothMaskReviewButton.textContent = "Generate / Refresh Mask";
    toothMaskReviewButton.style.cssText = "padding:10px 14px;border:0;border-radius:8px;background:#0b5b4f;color:#fff;font-weight:600;cursor:pointer;";
    toothMaskReviewButton.addEventListener("click", generateSelectedToothMask);
    toothMaskReviewStatus = document.createElement("p");
    toothMaskReviewStatus.setAttribute("role", "status");
    toothMaskReviewStatus.style.cssText = "margin:10px 0;color:#60736d;font-size:13px;line-height:1.45;";
    toothMaskReviewImage = document.createElement("img");
    toothMaskReviewImage.alt = "Selected tooth mask overlay preview";
    toothMaskReviewImage.style.cssText = "display:block;width:100%;height:auto;max-height:560px;object-fit:contain;border:1px solid #d8e5df;border-radius:8px;background:#fff;";
    toothMaskReviewPanel.append(title, help, toothMaskReviewButton, toothMaskReviewStatus, toothMaskReviewImage);
    host.appendChild(toothMaskReviewPanel);
}

async function generateSelectedToothMask() {
    if (!activeDesignFile || !selectedToothTarget) {
        showError("Analyze a selected tooth before generating its mask.");
        return;
    }
    ensureToothMaskReviewUI();
    if (!toothMaskReviewPanel) return;
    const token = ++toothMaskReviewToken;
    toothMaskReviewPanel.style.display = "block";
    toothMaskReviewButton.disabled = true;
    toothMaskReviewStatus.textContent = `Generating a preliminary mask for FDI ${selectedToothTarget.tooth}…`;
    toothMaskReviewImage.removeAttribute("src");
    try {
        const fd = new FormData();
        fd.append("image", activeDesignFile, activeDesignFile.name);
        fd.append("tooth", String(selectedToothTarget.tooth));
        fd.append("target", JSON.stringify(selectedToothTarget));
        fd.append("report", JSON.stringify({ tooth_targets: [selectedToothTarget] }));
        const response = await fetch("/api/tooth-mask", { method: "POST", body: fd });
        const raw = await response.text();
        let data;
        try { data = JSON.parse(raw); } catch (_) { throw new Error(`Mask endpoint returned an invalid response: ${raw.slice(0, 300)}`); }
        if (!response.ok || !data.success || !data.preview) throw new Error(data.error || "Could not generate the selected-tooth mask.");
        if (token !== toothMaskReviewToken) return;
        toothMaskReviewImage.src = data.preview;
        const metrics = data.maskMetrics || {};
        const box = metrics.boundingBox;
        const maskSummary = box
            ? `Mask estimate: ${box.width} × ${box.height} px; area ${Number(metrics.maskAreaPixels || 0).toLocaleString()} px; bounds x=${box.x}, y=${box.y}.`
            : "No reliable mask pixels were found for this tooth.";
        toothMaskReviewStatus.textContent = `Preliminary mask preview for FDI ${data.tooth}. Red indicates pixels selected by the current heuristic. ${maskSummary} These pixel values are only a rough estimate, not millimetres or a validated anatomical boundary. Enter the dentist's desired crown height and width in the target-size fields above. Manual boundary editing is not yet implemented in this build.`;
    } catch (error) {
        if (token === toothMaskReviewToken) toothMaskReviewStatus.textContent = error.message || "Mask generation failed.";
    } finally {
        if (token === toothMaskReviewToken) toothMaskReviewButton.disabled = false;
    }
}

function clearToothMaskReview() {
    toothMaskReviewToken++;
    if (toothMaskReviewPanel) toothMaskReviewPanel.style.display = "none";
    if (toothMaskReviewImage) toothMaskReviewImage.removeAttribute("src");
    if (toothMaskReviewStatus) toothMaskReviewStatus.textContent = "";
}

async function analyzeSelectedToothFromUI() {

    if (!activeDesignFile) {
        showError("Generate the initial smile design first. The generated image is required for precise tooth analysis.");
        return;
    }

    if (!preciseLocalizationReady) {
        showError("Start Precise Tooth Analysis first.");
        return;
    }

    const target = getSelectedToothTarget();

    if (!target) {
        showError("Please choose a tooth that Kimi marked as analyzable.");
        return;
    }

    clearError();

    testToothMaskBtn.disabled = true;
    visualizeToothBtn.disabled = true;
    toothMaskResult.classList.add("visible");
    syncPrecisionWorkspace();

    // Reuse the existing AI Tooth Localization Reference area.
    // Never create a second shimmer/image panel for subsequent teeth.
    const toothLoadToken = startToothReferenceLoadingState(target.tooth);

    toothAnalysisStatus.textContent =
        `Kimi is independently verifying and analyzing tooth ${target.tooth} in the generated smile design...`;
    toothAnalysisReport.textContent = "";
    toothMaskStatus.textContent = "";
    clearToothVisualizationPreview();

    try {
        const formData = new FormData();
        formData.append("image", activeDesignFile, activeDesignFile.name);
        formData.append("tooth", String(target.tooth));
        formData.append("target", JSON.stringify(target));

        // The full smile report is optional supplementary context.
        if (analysisReport) {
            formData.append("report", JSON.stringify(analysisReport));
        }

        const response = await fetch(
            "/api/tooth-analyze",
            {
                method: "POST",
                body: formData
            }
        );

        const responseText = await response.text();
        console.log("TOOTH ANALYZE STATUS:", response.status);
        console.log("TOOTH ANALYZE RESPONSE:", responseText);

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (error) {
            throw new Error(
                `Server returned a non-JSON response:\n\n${responseText.substring(0, 700)}`
            );
        }

        if (!response.ok || !data.success) {
            throw new Error(
                data.error ||
                `Kimi could not verify tooth ${target.tooth}.`
            );
        }

        selectedToothTarget = data.target;
        selectedToothReport = data.toothReport;
        const heightScaleEl = document.getElementById("desiredCrownHeightScale");
        if (heightScaleEl) heightScaleEl.dispatchEvent(new Event("input"));
        resetToothShapeVariantSelection();
        // Optional FDI shape variants appear only when the library has
        // configured references for the currently analyzed tooth.
        void loadToothShapeVariants(data.tooth);

        toothAnalysisStatus.textContent =
            `Tooth ${data.tooth} independently verified by Kimi.\n` +
            `Confidence: ${Number(data.toothReport?.confidence || 0).toFixed(2)}`;

        renderSelectedToothReport(
            data.toothReport,
            data.tooth
        );

        if (data.referenceImage) {
            showToothReferenceImage(data.referenceImage, toothLoadToken);
        } else {
            clearToothReferenceArea();
        }

        visualizeToothBtn.disabled = false;
        ensureToothMaskReviewUI();
        if (toothMaskReviewPanel) {
            toothMaskReviewPanel.style.display = "block";
            void generateSelectedToothMask();
        }
        toothMaskStatus.textContent =
            "Reference image prepared. Review the tooth-specific analysis and mask preview, then generate the visualization.";
        statusText.textContent =
            `Tooth ${data.tooth} analysis ready`;

    } catch (error) {
        console.error("TOOTH ANALYZE ERROR:", error);
        clearToothReferenceArea();
        toothAnalysisStatus.textContent =
            "Tooth-specific analysis failed.";
        showError(
            error.message ||
            "Unable to analyze the selected tooth."
        );
    } finally {
        testToothMaskBtn.disabled = false;
    }
}


visualizeToothBtn.addEventListener(
    "click",
    visualizeSelectedTooth
);


async function loadToothShapeVariants(toothNumber) {
    const panel = document.getElementById("toothShapeVariantPanel");
    if (!panel || !toothShapeVariantGrid || !toothShapeVariantStatus) return;

    const token = ++shapeVariantRequestToken;
    selectedShapeVariantId = "";
    panel.style.display = "block";
    toothShapeVariantGrid.replaceChildren();
    toothShapeVariantStatus.textContent = `Loading available shapes for tooth ${toothNumber}…`;

    try {
        const response = await fetch(`/api/tooth-shape-variants/${encodeURIComponent(String(toothNumber))}`);
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error("The server returned an invalid shape-variant response.");
        }

        if (token !== shapeVariantRequestToken) return;

        if (response.status === 404 || data.code === "NO_SHAPE_VARIANTS" ||
            !Array.isArray(data.variants) || data.variants.length === 0) {
            panel.style.display = "none";
            toothShapeVariantStatus.textContent = "";
            return;
        }
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Unable to load tooth shape references.");
        }

        const variants = data.variants.filter(variant => variant && variant.id);
        if (!variants.length) {
            panel.style.display = "none";
            return;
        }

        toothShapeVariantStatus.textContent = "Select one shape reference, or leave the selection unchanged to use the existing AI-generated approach.";

        variants.forEach(variant => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.variantId = String(variant.id);
            button.setAttribute("aria-pressed", "false");
            button.style.cssText = "display:flex;flex-direction:column;align-items:stretch;gap:8px;min-width:0;padding:10px;border:2px solid #d8e6e0;border-radius:10px;background:#fff;color:#164b43;text-align:left;cursor:pointer;font:inherit;";

            if (variant.image) {
                const image = document.createElement("img");
                image.src = variant.image;
                image.alt = `${variant.label || variant.id} tooth shape reference`;
                image.loading = "lazy";
                image.style.cssText = "display:block;width:100%;height:105px;object-fit:contain;border-radius:6px;background:#f0f6f3;";
                button.appendChild(image);
            } else {
                const placeholder = document.createElement("div");
                placeholder.textContent = "Shape reference";
                placeholder.style.cssText = "display:flex;align-items:center;justify-content:center;width:100%;height:105px;border-radius:6px;background:#f0f6f3;color:#60736d;font-size:12px;";
                button.appendChild(placeholder);
            }

            const label = document.createElement("strong");
            label.textContent = String(variant.label || variant.id).replace(/_/g, " ");
            label.style.cssText = "font-size:14px;line-height:1.3;";
            button.appendChild(label);

            if (variant.description) {
                const description = document.createElement("span");
                description.textContent = variant.description;
                description.style.cssText = "font-size:12px;line-height:1.4;color:#60736d;";
                button.appendChild(description);
            }

            button.addEventListener("click", () => {
                selectedShapeVariantId = String(variant.id);
                toothShapeVariantGrid.querySelectorAll("button[data-variant-id]").forEach(item => {
                    const selected = item.dataset.variantId === selectedShapeVariantId;
                    item.setAttribute("aria-pressed", selected ? "true" : "false");
                    item.style.borderColor = selected ? "#087f8c" : "#d8e6e0";
                    item.style.background = selected ? "#eaf7f6" : "#fff";
                });
                toothShapeVariantStatus.textContent = `Selected shape: ${String(variant.label || variant.id).replace(/_/g, " ")}.`;
            });

            toothShapeVariantGrid.appendChild(button);
        });
    } catch (error) {
        if (token !== shapeVariantRequestToken) return;
        console.warn("TOOTH SHAPE VARIANTS:", error);
        panel.style.display = "none";
        toothShapeVariantStatus.textContent = "";
        // The original tooth workflow remains usable if the optional
        // shape-reference endpoint is not available.
    }
}


function resetToothShapeVariantSelection() {
    shapeVariantRequestToken += 1;
    selectedShapeVariantId = "";
    const panel = document.getElementById("toothShapeVariantPanel");
    if (panel) panel.style.display = "none";
    if (toothShapeVariantGrid) toothShapeVariantGrid.replaceChildren();
    if (toothShapeVariantStatus) toothShapeVariantStatus.textContent = "";
}


function addApplyToothDesignButton(imageUrl, toothNumber) {
    if (!toothVisualizationPreview || !imageUrl) return;
    const existing = toothVisualizationPreview.querySelector("#applyToothDesignBtn");
    if (existing) existing.remove();
    const button = document.createElement("button");
    button.id = "applyToothDesignBtn";
    button.type = "button";
    button.textContent = "Use This Result as Current Smile Design";
    button.style.cssText = "display:block;margin:14px 0 0;padding:12px 18px;border:0;border-radius:8px;background:#164b43;color:#fff;font:inherit;font-weight:600;cursor:pointer;";
    button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Applying design…";
        try {
            generatedImageUrl = imageUrl;
            activeDesignFile = await imageUrlToFile(imageUrl, `simoura-smile-after-${String(toothNumber).replace(/[^a-z0-9_-]+/gi, "-")}.png`);
            smileVisualizationComplete = true;
            afterImage.src = generatedImageUrl;
            resetPreciseToothWorkflow(false);
            updatePreciseToothButtonState();
            preciseLocalizationStatus.textContent = `${String(toothNumber).startsWith("gap closure") ? "Gap-closure edit" : `FDI ${toothNumber} edit`} accepted as the current smile design. Re-run precise tooth analysis before making another edit.`;
            statusText.textContent = `${String(toothNumber).startsWith("gap closure") ? "Gap-closure edit" : `FDI ${toothNumber} edit`} applied to current design`;
            resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            console.error("APPLY TOOTH DESIGN ERROR:", error);
            showError(error.message || "Could not apply the selected-tooth result.");
            button.disabled = false;
            button.textContent = "Use This Result as Current Smile Design";
        }
    });
    toothVisualizationPreview.appendChild(button);
}


async function visualizeSelectedTooth() {

    if (!activeDesignFile) {
        showError("The generated smile design is missing. Generate it again before customizing a tooth.");
        return;
    }

    if (!selectedToothTarget || !selectedToothReport) {
        showError("Analyze and verify the selected tooth first.");
        return;
    }

    clearError();

    visualizeToothBtn.disabled = true;
    toothMaskStatus.textContent =
        `Customizing tooth ${selectedToothTarget.tooth} on the generated smile design...`;

    try {
        const formData = new FormData();
        formData.append("image", activeDesignFile, activeDesignFile.name);
        formData.append("tooth", String(selectedToothTarget.tooth));

        // Generate the selected-tooth mask automatically and send its overlay as a
        // guide image. It is not a clinical-grade segmentation; the backend labels it
        // as approximate and does not blend the guide into the output.
        let maskPreviewDataUrl = "";
        let toothMaskDataUrl = "";
        let maskMetrics = null;
        try {
            const maskFd = new FormData();
            maskFd.append("image", activeDesignFile, activeDesignFile.name);
            maskFd.append("tooth", String(selectedToothTarget.tooth));
            maskFd.append("target", JSON.stringify(selectedToothTarget));
            maskFd.append("report", JSON.stringify({ tooth_targets: [selectedToothTarget] }));
            const maskResponse = await fetch("/api/tooth-mask", { method: "POST", body: maskFd });
            const maskData = await maskResponse.json();
            if (maskResponse.ok && maskData.success && maskData.preview) {
                maskPreviewDataUrl = maskData.preview;
                toothMaskDataUrl = maskData.mask || "";
                maskMetrics = maskData.maskMetrics || null;
                formData.append("maskPreview", maskPreviewDataUrl);
                if (toothMaskDataUrl) formData.append("toothMask", toothMaskDataUrl);
                formData.append("maskMetrics", JSON.stringify(maskMetrics));
            } else {
                console.warn("Mask guide unavailable; proceeding with localization only:", maskData.error || maskResponse.status);
            }
        } catch (maskError) {
            console.warn("Mask guide request failed; proceeding with localization only:", maskError.message);
        }

        const desiredHeightRaw = String(document.getElementById("desiredCrownHeightMm")?.value || "").trim();
        const desiredWidthRaw = String(document.getElementById("desiredCrownWidthMm")?.value || "").trim();
        if (Boolean(desiredHeightRaw) !== Boolean(desiredWidthRaw)) {
            throw new Error("Enter both target crown height and width, or leave both blank.");
        }
        let desiredDimensionsMm = null;
        if (desiredHeightRaw && desiredWidthRaw) {
            const heightMm = Number(desiredHeightRaw);
            const widthMm = Number(desiredWidthRaw);
            if (!Number.isFinite(heightMm) || !Number.isFinite(widthMm) || heightMm < 1 || heightMm > 30 || widthMm < 1 || widthMm > 30) {
                throw new Error("Target crown height and width must each be between 1 and 30 mm.");
            }
            desiredDimensionsMm = { height: heightMm, width: widthMm };
        }
        const heightScale = Number(document.getElementById("desiredCrownHeightScale")?.value || 100);
        const widthScale = Number(document.getElementById("desiredCrownWidthScale")?.value || 100);
        if (!Number.isFinite(heightScale) || !Number.isFinite(widthScale) || heightScale < 70 || heightScale > 130 || widthScale < 70 || widthScale > 130) {
            throw new Error("Height and width adjustments must each be between 70% and 130%.");
        }
        const desiredSizeAdjustment = { heightPercent: heightScale, widthPercent: widthScale };
        formData.append(
            "payload",
            JSON.stringify({
                target: selectedToothTarget,
                toothReport: selectedToothReport,
                selectedVariantId: selectedShapeVariantId || "",
                desiredDimensionsMm,
                desiredSizeAdjustment,
                calibration: {
                    pixelsPerMm: Number(document.getElementById("pixelsPerMmCalibration")?.value || 0) || null
                }
            })
        );
        const customPrompt = String(
            document.getElementById("preciseToothCustomPrompt")?.value || ""
        ).trim();
        if (customPrompt.length > 1200) {
            throw new Error("Please keep your selected-tooth instructions under 1,200 characters.");
        }
        formData.set(
            "payload",
            JSON.stringify({
                target: selectedToothTarget,
                toothReport: selectedToothReport,
                selectedVariantId: selectedShapeVariantId || "",
                desiredDimensionsMm,
                desiredSizeAdjustment,
                customPrompt,
                calibration: {
                    pixelsPerMm: Number(document.getElementById("pixelsPerMmCalibration")?.value || 0) || null
                }
            })
        );
        formData.append("customPrompt", customPrompt);

        const response = await fetch(
            "/api/tooth-visualize",
            {
                method: "POST",
                body: formData
            }
        );

        const responseText = await response.text();
        console.log("TOOTH VISUALIZE STATUS:", response.status);
        console.log("TOOTH VISUALIZE RESPONSE:", responseText);

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (error) {
            throw new Error(
                `Server returned a non-JSON response:\n\n${responseText.substring(0, 700)}`
            );
        }

        if (!response.ok || !data.success) {
            throw new Error(
                data.error ||
                "Selected-tooth visualization failed."
            );
        }

        renderToothVisualizationPreview(
            data.generatedImage,
            data.tooth || selectedToothTarget.tooth
        );
        addApplyToothDesignButton(
            data.generatedImage,
            data.tooth || selectedToothTarget.tooth
        );
        if (data.visualQa?.pass === true && data.visualQa?.skipped !== true) {
            toothMaskStatus.textContent =
                `Tooth ${data.tooth} visualization passed the server-side visual QA check. The edit is composited through an approximate localization mask, not a clinical tooth segmentation. Review the result carefully before applying it.`;
        } else {
            toothMaskStatus.textContent =
                `Tooth ${data.tooth} visualization was generated, but server-side visual QA was not passed or was skipped. Review the result carefully; do not treat it as verified.`;
        }
        statusText.textContent =
            `Tooth ${data.tooth} visualization ready`;

    } catch (error) {
        console.error("TOOTH VISUALIZE ERROR:", error);
        toothMaskStatus.textContent =
            "Tooth visualization failed.";
        showError(
            error.message ||
            "Unable to generate the selected-tooth visualization."
        );
    } finally {
        visualizeToothBtn.disabled = false;
    }
}



// =========================================================
// GAP CLOSURE MODE (multi-tooth coordinated edit)
// =========================================================
let gapClosurePanel = null;
let gapClosureChoices = null;
let gapClosureButton = null;
let gapClosureStatus = null;
let gapClosureBusy = false;

function ensureGapClosureUI() {
    if (gapClosurePanel?.isConnected) return;

    gapClosurePanel = document.createElement("section");
    gapClosurePanel.id = "simouraGapClosurePanel";
    // Keep this as a normal-flow block below the entire tooth-selection row.
    // Inserting it beside the dropdown inside the row caused it to overlap
    // the analysis controls and apply buttons on narrower layouts.
    gapClosurePanel.style.cssText = [
        "display:block",
        "position:relative",
        "width:100%",
        "max-width:100%",
        "min-width:0",
        "height:auto",
        "max-height:none",
        "box-sizing:border-box",
        "clear:both",
        "margin:18px 0 0",
        "padding:18px",
        "border:1px solid #cbded8",
        "border-radius:12px",
        "background:#f8fbf9",
        "grid-column:1 / -1"
    ].join(";");

    const heading = document.createElement("h3");
    heading.textContent = "Gap Closure Mode";
    heading.style.cssText = "margin:0 0 6px;color:#164b43;font-size:19px;";

    const description = document.createElement("p");
    description.textContent = "Select two or more localized teeth. SIMOURA will make one coordinated edit to close visible gaps between the selected teeth while preserving unselected teeth.";
    description.style.cssText = "margin:0 0 12px;color:#526a65;line-height:1.5;font-size:14px;";

    gapClosureChoices = document.createElement("div");
    gapClosureChoices.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:8px;max-height:220px;overflow-y:auto;overflow-x:hidden;padding:2px;min-width:0;box-sizing:border-box;";

    gapClosureButton = document.createElement("button");
    gapClosureButton.type = "button";
    gapClosureButton.textContent = "Close Gaps in Selected Teeth";
    gapClosureButton.style.cssText = "margin-top:14px;border:0;border-radius:8px;padding:12px 16px;background:#164b43;color:#fff;font:inherit;font-weight:600;cursor:pointer;";
    gapClosureButton.addEventListener("click", generateGapClosure);

    gapClosureStatus = document.createElement("p");
    gapClosureStatus.setAttribute("role", "status");
    gapClosureStatus.setAttribute("aria-live", "polite");
    gapClosureStatus.style.cssText = "margin:10px 0 0;color:#526a65;line-height:1.5;font-size:14px;";

    gapClosurePanel.append(heading, description, gapClosureChoices, gapClosureButton, gapClosureStatus);
    // Insert after the full selection row, never inside the dropdown's
    // immediate parent. This lets the panel take its own vertical space.
    const selectionRow = toothSelect?.closest(".row");
    const anchor = selectionRow?.isConnected ? selectionRow : toothSelect?.parentElement;
    if (anchor?.isConnected) {
        anchor.insertAdjacentElement("afterend", gapClosurePanel);
    } else if (toothSelect?.isConnected) {
        toothSelect.insertAdjacentElement("afterend", gapClosurePanel);
    }
}

function renderGapClosureToothChoices() {
    ensureGapClosureUI();
    if (!gapClosureChoices) return;

    const previouslySelected = new Set(
        Array.from(gapClosureChoices.querySelectorAll('input[type="checkbox"]:checked'))
            .map(input => input.value)
    );
    gapClosureChoices.replaceChildren();

    if (!preciseToothTargets.length) {
        const empty = document.createElement("p");
        empty.textContent = "Run precise tooth analysis on the current generated smile first.";
        empty.style.cssText = "margin:0;color:#60736d;font-size:14px;";
        gapClosureChoices.appendChild(empty);
        if (gapClosureButton) gapClosureButton.disabled = true;
        return;
    }

    preciseToothTargets.forEach(target => {
        const tooth = String(target.tooth);
        const label = document.createElement("label");
        label.style.cssText = "display:flex;align-items:flex-start;gap:8px;min-width:0;box-sizing:border-box;padding:8px 10px;border:1px solid #d8e6e0;border-radius:8px;background:#fff;color:#244b43;cursor:pointer;font-size:14px;overflow-wrap:anywhere;";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = tooth;
        checkbox.checked = previouslySelected.has(tooth);
        checkbox.addEventListener("change", () => {
            const count = gapClosureChoices.querySelectorAll('input[type="checkbox"]:checked').length;
            gapClosureButton.disabled = count < 2 || gapClosureBusy;
            if (gapClosureStatus) gapClosureStatus.textContent = count < 2
                ? "Select at least two teeth to close a gap."
                : `${count} teeth selected. Gaps between selected teeth can be targeted.`;
        });

        const text = document.createElement("span");
        text.textContent = `${tooth}${target.label ? " — " + target.label : ""}`;
        text.style.cssText = "min-width:0;overflow-wrap:anywhere;line-height:1.45;";
        checkbox.style.cssText = "flex:0 0 auto;margin-top:4px;";
        label.append(checkbox, text);
        gapClosureChoices.appendChild(label);
    });

    const selectedCount = gapClosureChoices.querySelectorAll('input[type="checkbox"]:checked').length;
    if (gapClosureButton) gapClosureButton.disabled = selectedCount < 2 || gapClosureBusy;
}

async function generateGapClosure() {
    if (gapClosureBusy) return;
    if (!activeDesignFile) {
        showError("Generate a smile design first, then run precise tooth analysis on that design.");
        return;
    }

    const selectedNumbers = Array.from(
        gapClosureChoices?.querySelectorAll('input[type="checkbox"]:checked') || []
    ).map(input => input.value);
    if (selectedNumbers.length < 2) {
        if (gapClosureStatus) gapClosureStatus.textContent = "Select at least two teeth to close a gap.";
        return;
    }

    const selectedTargets = selectedNumbers.map(number =>
        preciseToothTargets.find(target => String(target.tooth) === number)
    ).filter(Boolean);

    if (selectedTargets.length < 2) {
        showError("At least two selected teeth must have valid localization data.");
        return;
    }

    clearError();
    gapClosureBusy = true;
    gapClosureButton.disabled = true;
    gapClosureButton.textContent = "Closing Gaps…";
    gapClosureStatus.textContent = "Generating one coordinated gap-closure edit. Please wait.";
    toothMaskStatus.textContent = `Closing gaps between FDI teeth ${selectedNumbers.join(", ")}…`;
    generationProgress.classList.add("visible");
    generationProgress.scrollIntoView({ behavior: "smooth", block: "center" });

    try {
        const primary = selectedTargets[0];
        const customPrompt = String(document.getElementById("preciseToothCustomPrompt")?.value || "").trim();
        if (customPrompt.length > 1200) {
            throw new Error("Please keep your gap-closure instructions under 1,200 characters.");
        }

        const formData = new FormData();
        formData.append("image", activeDesignFile, activeDesignFile.name);
        formData.append("tooth", String(primary.tooth));
        formData.append("payload", JSON.stringify({
            gapClosure: true,
            selectedTargets,
            target: primary,
            toothReport: {
                success: true,
                analyzable: true,
                tooth: String(primary.tooth),
                summary: "Dentist-requested coordinated gap closure.",
                visualization_instructions: "Close visible interdental gaps between selected teeth with conservative coordinated contour adjustments. Preserve separate tooth identities and natural proportions. Do not alter unselected teeth."
            },
            selectedVariantId: "",
            desiredDimensionsMm: null
        }));
        formData.append("customPrompt", customPrompt);

        const response = await fetch("/api/tooth-visualize", { method: "POST", body: formData });
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error(`Server returned an invalid gap-closure response: ${responseText.slice(0, 500)}`);
        }
        if (!response.ok || !data.success || !data.generatedImage) {
            throw new Error(data.error || "Gap closure visualization failed.");
        }

        const label = `gap closure (${selectedNumbers.join(", ")})`;
        renderToothVisualizationPreview(data.generatedImage, label);
        addApplyToothDesignButton(data.generatedImage, label);
        gapClosureStatus.textContent = `Gap-closure preview generated for FDI ${selectedNumbers.join(", ")}. Review the result before applying it to the current smile design. QA is bypassed in this development build.`;
        toothMaskStatus.textContent = `Gap-closure preview ready for FDI ${selectedNumbers.join(", ")}.`;
        statusText.textContent = "Gap-closure visualization ready";
    } catch (error) {
        console.error("GAP CLOSURE ERROR:", error);
        gapClosureStatus.textContent = error.message || "Gap closure failed.";
        showError(error.message || "Unable to generate gap closure.");
    } finally {
        gapClosureBusy = false;
        if (gapClosureButton) {
            gapClosureButton.disabled = gapClosureChoices?.querySelectorAll('input[type="checkbox"]:checked').length < 2;
            gapClosureButton.textContent = "Close Gaps in Selected Teeth";
        }
        generationProgress.classList.remove("visible");
    }
}


function resetToothMaskUI() {
    resetPreciseToothWorkflow();
}


/* =========================================================
   RENDER REPORT
========================================================= */

function renderReport(report) {

    document.getElementById(
        "summaryText"
    ).textContent =
        report.summary ||
        "No summary available.";


    const characteristics =
        report.smile_characteristics ||
        {};


    document.getElementById(
        "alignment"
    ).textContent =
        characteristics.alignment ||
        "Not clearly visible";


    document.getElementById(
        "crowding"
    ).textContent =
        characteristics.crowding ||
        "Not clearly visible";


    document.getElementById(
        "toothShade"
    ).textContent =
        characteristics.tooth_shade ||
        "Not clearly visible";


    document.getElementById(
        "smileArc"
    ).textContent =
        characteristics.smile_arc ||
        "Not clearly visible";


    document.getElementById(
        "gumDisplay"
    ).textContent =
        characteristics.gum_display ||
        "Not clearly visible";


    document.getElementById(
        "toothProportions"
    ).textContent =
        characteristics.tooth_proportions ||
        "Not clearly visible";


    /* OBSERVATIONS */

    const observationsList =
        document.getElementById(
            "observationsList"
        );

    observationsList.innerHTML =
        "";


    const observations =
        Array.isArray(
            report.observations
        )
            ? report.observations
            : [];


    if (!observations.length) {

        observationsList.innerHTML = `
                <div class="observation">
                    <span class="observation-dot"></span>
                    <span>No additional visible observations.</span>
                </div>
            `;

    } else {

        observations.forEach(
            observation => {

                const div =
                    document.createElement(
                        "div"
                    );

                div.className =
                    "observation";

                div.innerHTML = `
                        <span class="observation-dot"></span>
                        <span>${escapeHtml(observation)}</span>
                    `;

                observationsList.appendChild(
                    div
                );

            }
        );

    }


    /* TREATMENTS */

    const treatmentList =
        document.getElementById(
            "treatmentList"
        );

    treatmentList.innerHTML =
        "";


    const treatments =
        Array.isArray(
            report.treatment_options
        )
            ? report.treatment_options
            : [];


    if (!treatments.length) {

        treatmentList.innerHTML = `
                <div class="treatment">
                    <div class="treatment-reason">
                        No specific visualization areas were identified.
                    </div>
                </div>
            `;

    } else {

        treatments.forEach(
            treatment => {

                const name =
                    treatment.name ||
                    "Potential option";

                const reason =
                    treatment.reason ||
                    "";

                const div =
                    document.createElement(
                        "div"
                    );

                div.className =
                    "treatment";

                div.innerHTML = `
                        <div class="treatment-name">
                            ${escapeHtml(name)}
                        </div>

                        <div class="treatment-reason">
                            ${escapeHtml(reason)}
                        </div>
                    `;

                treatmentList.appendChild(
                    div
                );

            }
        );

    }


    /* PLAN */

    const plan =
        report.visualization_plan ||
        {};


    setPlanState(
        "planAlignment",
        plan.alignment
    );

    setPlanState(
        "planWhitening",
        plan.whitening
    );

    setPlanState(
        "planVeneers",
        plan.veneers
    );

    setPlanState(
        "planEnamel",
        plan.enamel_recontouring
    );

    setPlanState(
        "planGum",
        plan.gum_modification
    );

}


function setPlanState(
    elementId,
    active
) {

    const element =
        document.getElementById(
            elementId
        );

    if (!element) {
        return;
    }

    element.classList.toggle(
        "active",
        Boolean(active)
    );

}


/* =========================================================
   IMAGE QUALITY / GENERATION BLOCK
========================================================= */

function updateVisualizationAvailability(
    report
) {

    const reasons =
        getBlockingReasons(
            report
        );

    // IMPORTANT:
    // Do not block the visualization merely because Kimi
    // returned visualization_ready=false without an explicit
    // image-quality reason. Only explicit quality failures
    // are allowed to block generation.
    const allowed =
        !!report &&
        reasons.length === 0;

    if (!allowed) {

        generateBtn.disabled =
            true;

        generationAction.style.display =
            "none";

        qualityWarning.classList.add(
            "visible"
        );

        warningList.innerHTML =
            "";

        const finalReasons =
            reasons.length
                ? reasons
                : [
                    "The photograph does not provide enough clearly visible dental detail."
                ];

        finalReasons.forEach(
            reason => {

                const li =
                    document.createElement(
                        "li"
                    );

                li.textContent =
                    reason;

                warningList.appendChild(
                    li
                );

            }
        );

        return;
    }

    qualityWarning.classList.remove(
        "visible"
    );

    generationAction.style.display =
        "flex";

    generateBtn.disabled =
        false;
}


function getBlockingReasons(
    report
) {

    const reasons = [];

    const quality =
        report?.image_quality ||
        {};

    // ONLY use explicit image-quality flags from Kimi.
    // Never inspect normal observations for blocking words.
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

    if (
        quality.teeth_visible === false
    ) {

        reasons.push(
            "The teeth are not clearly visible."
        );
    }

    if (
        quality.usable_for_visualization === false
    ) {

        reasons.push(
            "The photograph does not provide enough clear dental detail for visualization."
        );
    }

    // Treat an explicitly closed mouth as a blocking condition.
    if (
        typeof quality.mouth_visibility === "string" &&
        quality.mouth_visibility
            .toLowerCase()
            .includes("closed")
    ) {

        reasons.push(
            "Please use a photograph with the teeth clearly visible."
        );
    }

    // Treat an explicitly unusable/blurry quality value as blocking.
    if (
        typeof quality.clarity === "string" &&
        /severely?\s*blur|out\s*of\s*focus/i.test(
            quality.clarity
        )
    ) {

        reasons.push(
            "The photograph appears too blurry or out of focus."
        );
    }

    return [
        ...new Set(
            reasons.filter(Boolean)
        )
    ];
}


/* =========================================================
   GENERATE VISUALIZATION
========================================================= */

generateBtn.addEventListener(
    "click",
    generateVisualization
);


async function generateVisualization() {

    if (!selectedFile) {

        showError(
            "Original image is missing."
        );

        return;
    }


    if (!analysisReport) {

        showError(
            "Please analyze the smile first."
        );

        return;
    }


    const blockingReasons =
        getBlockingReasons(
            analysisReport
        );


    if (
        blockingReasons.length > 0
    ) {

        updateVisualizationAvailability(
            analysisReport
        );


        qualityWarning.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });


        return;
    }


    clearError();


    /*
     * IMPORTANT:
     * Immediately move the user to the generation
     * section before the API request starts.
     */

    generationCard.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });


    generateBtn.disabled =
        true;


    generationProgress.classList.add(
        "visible"
    );


    statusText.textContent =
        "Creating visualization";


    generationProgress.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });


    try {

        const formData =
            new FormData();


        formData.append(
            "image",
            selectedFile
        );


        formData.append(
            "report",
            JSON.stringify(
                analysisReport
            )
        );


        const response =
            await fetch(
                "/api/generate",
                {
                    method: "POST",
                    body: formData
                }
            );


        const responseText =
            await response.text();


        console.log(
            "GENERATE STATUS:",
            response.status
        );

        console.log(
            "GENERATE CONTENT TYPE:",
            response.headers.get(
                "content-type"
            )
        );

        console.log(
            "GENERATE RESPONSE:",
            responseText
        );


        let data;


        try {

            data =
                JSON.parse(
                    responseText
                );

        } catch (parseError) {

            throw new Error(
                `Server returned a non-JSON response:\n\n${responseText.substring(0, 700)}`
            );

        }


        if (
            !response.ok ||
            !data.success
        ) {

            if (
                data.code ===
                "IMAGE_NOT_SUITABLE"
            ) {

                analysisReport.visualization_ready =
                    false;


                analysisReport.image_quality =
                    analysisReport.image_quality ||
                    {};


                analysisReport.image_quality
                    .blocking_reasons =
                    data.blockingReasons ||
                    [];


                updateVisualizationAvailability(
                    analysisReport
                );

            }


            throw new Error(
                data.error ||
                "Image generation failed."
            );

        }


        generatedImageUrl =
            data.generatedImage;

        activeDesignFile = await imageUrlToFile(generatedImageUrl, "simoura-generated-smile.png");
        smileVisualizationComplete = true;
        resetPreciseToothWorkflow(false);
        updatePreciseToothButtonState();
        preciseLocalizationStatus.textContent =
            "Initial smile design generated. Start precise tooth analysis to locate teeth in this generated image.";

        beforeImage.src =
            originalImageUrl;

        afterImage.src =
            generatedImageUrl;


        resultSection.classList.add(
            "visible"
        );

        ensureSmileRefinementUI();
        setRefinementStatus("");



        generationProgress.classList.remove(
            "visible"
        );


        statusText.textContent =
            "Visualization ready";


        setTimeout(
            () => {

                resultSection.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

            },
            250
        );


    } catch (error) {

        console.error(
            "GENERATE ERROR:",
            error
        );


        generationProgress.classList.remove(
            "visible"
        );


        showError(
            error.message ||
            "Unable to generate the visualization."
        );


        statusText.textContent =
            "Generation failed";


    } finally {

        generateBtn.disabled =
            false;

    }

}


/* =========================================================
   GENERATE AGAIN
========================================================= */

document.getElementById(
    "generateAgainBtn"
).addEventListener(
    "click",
    async () => {

        if (!analysisReport) {
            return;
        }


        if (
            getBlockingReasons(
                analysisReport
            ).length > 0
        ) {

            updateVisualizationAvailability(
                analysisReport
            );

            qualityWarning.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            return;
        }


        await generateVisualization();

    }
);


/* =========================================================
   DOWNLOAD BEFORE
========================================================= */

document.getElementById(
    "downloadBeforeBtn"
).addEventListener(
    "click",
    () => {

        if (!originalImageUrl) {
            return;
        }


        downloadUrl(
            originalImageUrl,
            "smile-before.png"
        );

    }
);


/* =========================================================
   DOWNLOAD AFTER
========================================================= */

document.getElementById(
    "downloadAfterBtn"
).addEventListener(
    "click",
    async () => {

        if (!generatedImageUrl) {
            return;
        }


        try {

            await downloadUrl(
                generatedImageUrl,
                "smile-after.png"
            );

        } catch (error) {

            console.error(
                error
            );

            window.open(
                generatedImageUrl,
                "_blank"
            );

        }

    }
);


async function downloadUrl(
    url,
    filename
) {

    if (
        url.startsWith(
            "data:"
        )
    ) {

        const a =
            document.createElement(
                "a"
            );

        a.href =
            url;

        a.download =
            filename;

        document.body.appendChild(
            a
        );

        a.click();

        a.remove();

        return;
    }


    const response =
        await fetch(
            url
        );


    if (!response.ok) {

        throw new Error(
            "Unable to download image."
        );

    }


    const blob =
        await response.blob();


    const objectUrl =
        URL.createObjectURL(
            blob
        );


    const a =
        document.createElement(
            "a"
        );

    a.href =
        objectUrl;

    a.download =
        filename;

    document.body.appendChild(
        a
    );

    a.click();

    a.remove();


    setTimeout(
        () => {

            URL.revokeObjectURL(
                objectUrl
            );

        },
        1000
    );

}


/* =========================================================
   NEW IMAGE
========================================================= */

document.getElementById(
    "newPatientBtn"
).addEventListener(
    "click",
    () => {

        resetApplication();

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    }
);


/* =========================================================
   RESET
========================================================= */

function resetApplication() {

    selectedFile = null;

    analysisReport = null;

    fullSmileAnalysisComplete = false;

    generatedImageUrl = null;
    activeDesignFile = null;
    smileVisualizationComplete = false;

    resetToothMaskUI();


    if (originalImageUrl) {

        URL.revokeObjectURL(
            originalImageUrl
        );

    }


    originalImageUrl = null;


    fileInput.value = "";


    previewImage.src = "";

    fileThumbnail.src = "";


    previewSection.classList.remove(
        "visible"
    );

    reportSection.classList.remove(
        "visible"
    );

    generationCard.classList.remove(
        "visible"
    );

    resultSection.classList.remove(
        "visible"
    );

    processing.classList.remove(
        "visible"
    );

    generationProgress.classList.remove(
        "visible"
    );

    qualityWarning.classList.remove(
        "visible"
    );


    generationAction.style.display =
        "flex";


    analyzeBtn.disabled =
        true;

    fullSmileAnalysisComplete = false;

    startPreciseToothBtn.disabled =
        true;

    preciseLocalizationStatus.textContent =
        "Upload an image to begin precise tooth analysis.";

    generateBtn.disabled =
        false;


    clearError();


    statusText.textContent =
        "Ready for analysis";

}


/* =========================================================
   PROCESSING
========================================================= */

function setProcessing(
    active,
    message = ""
) {

    if (active) {

        processing.classList.add(
            "visible"
        );

        processingText.textContent =
            message;

    } else {

        processing.classList.remove(
            "visible"
        );

    }

}


/* =========================================================
   ERROR
========================================================= */

function showError(
    message
) {

    errorBox.textContent =
        message;

    errorBox.classList.add(
        "visible"
    );

}


function clearError() {

    errorBox.textContent =
        "";

    errorBox.classList.remove(
        "visible"
    );

}


/* =========================================================
   SELECTED TOOTH REPORT RENDERER
   Converts Kimi's mixed/plain-text/JSON response into
   a clean, readable clinical-style UI.
========================================================= */

function renderSelectedToothReport(
    rawReport,
    toothNumber
) {

    if (!toothAnalysisReport) {
        return;
    }

    const report = normalizeToothReport(rawReport);

    const parsedSummary =
        extractEmbeddedToothSections(
            typeof report.summary === "string"
                ? report.summary
                : ""
        );

    const assessment = normalizeAssessment(
        report.assessment ||
        parsedSummary.assessment ||
        {}
    );

    const summary = cleanSummary(
        report.summary ||
        parsedSummary.summary ||
        "No summary returned."
    );

    const visualizationInstructions =
        report.visualization_instructions ||
        report.visualizationInstructions ||
        report.visualization_direction ||
        parsedSummary.visualizationInstructions ||
        "No visualization instructions returned.";

    const confidence = Number(report.confidence);
    const confidenceText = Number.isFinite(confidence)
        ? confidence.toFixed(2)
        : "—";

    const fields = Object.entries(assessment);

    const assessmentMarkup = fields.length
        ? fields.map(([key, value], index) => `
                <div class="tooth-report-item">
                    <span class="tooth-report-item-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
                    <div class="tooth-report-item-content">
                        <div class="tooth-report-item-label">
                            ${escapeHtml(formatToothFieldLabel(key))}
                        </div>
                        <div class="tooth-report-item-value">
                            ${escapeHtml(formatToothValue(value))}
                        </div>
                    </div>
                </div>
            `).join("")
        : `
                <div class="tooth-report-empty">
                    No detailed assessment was returned.
                </div>
            `;

    ensureToothReportStyles();

    toothAnalysisReport.innerHTML = `
            <article class="tooth-report-card">

                <header class="tooth-report-header">
                    <div>
                        <div class="tooth-report-kicker">
                            SELECTED TOOTH
                        </div>
                        <h3 class="tooth-report-title">
                            Tooth ${escapeHtml(toothNumber || "—")} Analysis
                        </h3>
                    </div>

                    <div class="tooth-report-confidence">
                        <span>Confidence</span>
                        <strong>${escapeHtml(confidenceText)}</strong>
                    </div>
                </header>

                <section class="tooth-report-section tooth-report-summary">
                    <div class="tooth-report-summary-icon" aria-hidden="true">▤</div>
                    <div class="tooth-report-summary-content">
                        <h4>Summary</h4>
                        <p>${escapeHtml(summary)}</p>
                    </div>
                </section>

                <section class="tooth-report-section tooth-report-assessment-section">
                    <div class="tooth-report-detail-kicker">Detailed Assessment</div>
                    <h4>Assessment</h4>
                    <div class="tooth-report-grid">
                        ${assessmentMarkup}
                    </div>
                </section>

                <section class="tooth-report-section tooth-report-visualization">
                    <span class="tooth-report-visualization-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M8.2 14.5A7 7 0 1 1 15.8 14.5c-.9.7-1.3 1.7-1.5 2.5H9.7c-.2-.8-.6-1.8-1.5-2.5Z"/></svg>
                    </span>
                    <div class="tooth-report-visualization-content">
                        <h4>Visualization Instructions</h4>
                        <p>${escapeHtml(visualizationInstructions)}</p>
                    </div>
                </section>

            </article>
        `;
}


function normalizeToothReport(rawReport) {

    if (!rawReport) {
        return {};
    }

    if (
        typeof rawReport === "object" &&
        !Array.isArray(rawReport)
    ) {
        return { ...rawReport };
    }

    if (typeof rawReport === "string") {

        const text = rawReport.trim();

        try {
            const parsed = JSON.parse(text);

            if (
                parsed &&
                typeof parsed === "object" &&
                !Array.isArray(parsed)
            ) {
                return parsed;
            }
        } catch (error) {
            // Kimi sometimes returns mixed prose + JSON.
        }

        return {
            summary: text
        };
    }

    return {};
}


function extractEmbeddedToothSections(text) {

    if (!text) {
        return {
            summary: "",
            assessment: {},
            visualizationInstructions: ""
        };
    }

    let working = String(text).trim();
    let summary = working;
    let assessment = {};
    let visualizationInstructions = "";

    const assessmentMatch = working.match(
        /(?:^|\\n)\\s*Assessment\\s*([\\{\\[])/i
    );

    if (assessmentMatch) {

        const assessmentStart =
            assessmentMatch.index +
            assessmentMatch[0].lastIndexOf(
                assessmentMatch[1]
            );

        const jsonStart = assessmentStart;
        const jsonEnd = findBalancedJsonEnd(
            working,
            jsonStart
        );

        if (jsonEnd !== -1) {

            const jsonText =
                working.slice(
                    jsonStart,
                    jsonEnd + 1
                );

            try {
                const parsed = JSON.parse(jsonText);

                if (
                    parsed &&
                    typeof parsed === "object"
                ) {
                    assessment = parsed;
                }
            } catch (error) {
                // Leave assessment empty if malformed.
            }

            const beforeAssessment =
                working.slice(
                    0,
                    assessmentMatch.index
                );

            const afterAssessment =
                working.slice(jsonEnd + 1);

            const visualizationMatch =
                afterAssessment.match(
                    /(?:Visualization\\s+(?:instructions|direction)|Visualization instructions)\\s*/i
                );

            if (visualizationMatch) {
                summary = beforeAssessment.trim();
                visualizationInstructions =
                    afterAssessment
                        .slice(
                            visualizationMatch.index +
                            visualizationMatch[0].length
                        )
                        .trim();
            } else {
                summary = beforeAssessment.trim();
            }
        }
    }

    // Also handle a JSON assessment embedded without a newline.
    if (
        !Object.keys(assessment).length
    ) {
        const inline = working.match(
            /Assessment\\s*(\\{[\\s\\S]*?\\})\\s*(?:Visualization\\s+(?:instructions|direction))?/i
        );

        if (inline) {
            try {
                assessment = JSON.parse(inline[1]);
            } catch (error) {
                // Ignore malformed embedded JSON.
            }

            summary = working
                .slice(0, inline.index)
                .trim();

            const after = working.slice(
                inline.index + inline[0].length
            );

            if (after.trim()) {
                visualizationInstructions = after.trim();
            }
        }
    }

    summary = summary
        .replace(/^Summary\\s*/i, "")
        .trim();

    visualizationInstructions = visualizationInstructions
        .replace(/^[:\\-\\s]+/, "")
        .trim();

    return {
        summary,
        assessment,
        visualizationInstructions
    };
}


function findBalancedJsonEnd(text, start) {

    const opening = text[start];

    if (opening !== "{" && opening !== "[") {
        return -1;
    }

    const closing = opening === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {

        const char = text[i];

        if (inString) {

            if (escaped) {
                escaped = false;
            } else if (char === "\\") {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }

            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === opening) {
            depth++;
        } else if (char === closing) {
            depth--;

            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}


function normalizeAssessment(assessment) {

    if (!assessment) {
        return {};
    }

    if (
        typeof assessment === "object" &&
        !Array.isArray(assessment)
    ) {
        return assessment;
    }

    if (typeof assessment === "string") {
        try {
            const parsed = JSON.parse(assessment);

            if (
                parsed &&
                typeof parsed === "object" &&
                !Array.isArray(parsed)
            ) {
                return parsed;
            }
        } catch (error) {
            return {};
        }
    }

    return {};
}


function cleanSummary(summary) {

    if (!summary) {
        return "No summary returned.";
    }

    return String(summary)
        .replace(/^Summary\\s*/i, "")
        .trim();
}


function formatToothFieldLabel(key) {

    return String(key)
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\\s+/g, " ")
        .trim()
        .replace(/\\b\\w/g, char => char.toUpperCase());
}


function formatToothValue(value) {

    if (value === null || value === undefined) {
        return "—";
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
}


function ensureToothReportStyles() {

    if (document.getElementById("simoura-tooth-report-styles")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "simoura-tooth-report-styles";

    style.textContent = `
            #toothAnalysisReport {
                width: 100%;
                margin: 0;
                box-sizing: border-box;
            }
            .tooth-report-card {
                width: 100%;
                margin: 0;
                background: #fff;
                border: 1px solid #dcebe5;
                border-radius: 14px;
                overflow: hidden;
                box-sizing: border-box;
            }
            .tooth-report-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 18px;
                padding: 16px 20px;
                background: #f7faf8;
                border: 1px solid #e2eee8;
                border-radius: 10px;
                margin: 12px 12px 10px;
            }
            .tooth-report-kicker {
                margin-bottom: 4px;
                color: #b28d45;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: .12em;
                text-transform: uppercase;
            }
            .tooth-report-title {
                margin: 0;
                color: #123f38;
                font-family: "Cormorant Garamond", Georgia, serif;
                font-size: 28px;
                line-height: 1.12;
                font-weight: 600;
            }
            .tooth-report-confidence {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                border: 1px solid #d0e8df;
                border-radius: 999px;
                background: #eaf7f2;
                color: #0b5b4f;
                font-size: 12px;
                white-space: nowrap;
            }
            .tooth-report-confidence span { color: #60736d; }
            .tooth-report-confidence strong { color: #0b5b4f; }
            .tooth-report-section { padding: 16px 26px; }
            .tooth-report-section h4 {
                margin: 0 0 10px;
                color: #123f38;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: .08em;
                text-transform: uppercase;
            }
            .tooth-report-summary {
                display: flex;
                align-items: flex-start;
                gap: 14px;
                margin: 0 12px 12px;
                padding: 13px 14px;
                background: #f7faf8;
                border: 1px solid #e2eee8;
                border-radius: 10px;
            }
            .tooth-report-summary-icon {
                flex: 0 0 40px;
                width: 40px;
                height: 40px;
                display: grid;
                place-items: center;
                border-radius: 9px;
                background: #e2f3ed;
                color: #0b5b4f;
                font-size: 22px;
            }
            .tooth-report-summary-content { min-width: 0; }
            .tooth-report-summary-content h4 { margin: 1px 0 6px; }
            .tooth-report-summary p,
            .tooth-report-visualization p {
                max-width: none;
                margin: 0;
                color: #526d68;
                font-size: 12px;
                line-height: 1.65;
            }
            .tooth-report-detail-kicker {
                margin: 0 0 14px;
                color: #123f38;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: .08em;
                text-transform: uppercase;
                display: none
            }
            .tooth-report-assessment-section > h4 { margin-bottom: 12px; }
            .tooth-report-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }
            .tooth-report-item {
                display: flex !important;
                align-items: flex-start;
                gap: 14px;
                min-width: 0;
                padding: 13px 14px !important;
                background: #fff;
                border: 1px solid #dfebe6;
                border-radius: 10px;
                box-sizing: border-box;
                overflow-wrap: anywhere;
            }
            #precisionToothAnalysisPanel .tooth-report-item::before,
            #precisionToothAnalysisPanel .tooth-report-item::after,
            #precisionToothAnalysisPanel .tooth-report-item-label::before,
            #precisionToothAnalysisPanel .tooth-report-item-label::after {
                content: none !important;
                display: none !important;
            }
            .tooth-report-item-number {
                flex: 0 0 38px;
                width: 38px;
                height: 38px;
                display: grid;
                place-items: center;
                border-radius: 50%;
                background: #e2f4ee;
                color: #0b5b4f;
                font-size: 13px;
                font-weight: 700;
            }
            .tooth-report-item-content {
                min-width: 0;
                flex: 1;
                position: static !important;
                display: block !important;
            }
            .tooth-report-item-label {
                display: block !important;
                position: static !important;
                width: auto !important;
                max-width: 100%;
                margin: 3px 0 6px !important;
                padding: 0 !important;
                color: #123f38;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: .05em;
                text-transform: uppercase;
                transform: none !important;
                overflow-wrap: anywhere;
            }
            .tooth-report-item-value {
                display: block !important;
                position: static !important;
                width: auto !important;
                max-width: 100%;
                margin: 0 !important;
                padding: 0 !important;
                color: #526d68;
                font-size: 12px;
                line-height: 1.55;
                transform: none !important;
                overflow-wrap: anywhere;
                word-break: normal;
            }
            .tooth-report-visualization {
                display: flex;
                align-items: flex-start;
                gap: 13px;
                margin: 4px 12px 16px;
                padding: 15px 16px;
                background: #edf8f4;
                border: 1px solid #cde9df;
                border-left: 3px solid #00a982;
                border-radius: 9px;
                box-sizing: border-box;
            }
            .tooth-report-visualization-icon {
                flex: 0 0 20px;
                display: inline-flex;
                color: #00a982;
                line-height: 1;
                margin-top: 1px;
            }
            .tooth-report-visualization-icon svg { display: block; }
            .tooth-report-visualization-content { min-width: 0; }
            .tooth-report-visualization h4 {
                position: static !important;
                display: block !important;
                margin: 1px 0 7px !important;
                padding: 0 !important;
                color: #0b5b4f;
                line-height: 1.4 !important;
                transform: none !important;
            }
            .tooth-report-visualization h4::before,
            .tooth-report-visualization h4::after { content: none !important; display: none !important; }
            .tooth-report-empty {
                grid-column: 1 / -1;
                padding: 18px;
                color: #60736d;
                background: #f8faf9;
                border-radius: 12px;
            }
            @media (max-width: 760px) {
                .tooth-report-header { align-items: flex-start; }
                .tooth-report-title { font-size: 25px; }
                .tooth-report-section { padding-left: 16px; padding-right: 16px; }
                .tooth-report-grid { grid-template-columns: 1fr; }
                .tooth-report-visualization { margin-left: 12px; margin-right: 12px; }
            }
        `;

    document.head.appendChild(style);
}


/* =========================================================
   HELPERS
========================================================= */

function formatBytes(
    bytes
) {

    if (!bytes) {
        return "0 KB";
    }


    const units =
        [
            "B",
            "KB",
            "MB",
            "GB"
        ];


    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );


    return (
        parseFloat(
            (
                bytes /
                Math.pow(
                    1024,
                    index
                )
            ).toFixed(2)
        ) +
        " " +
        units[index]
    );

}


function escapeHtml(
    value
) {

    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );

}
