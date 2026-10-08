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

    let selectedToothReport = null;
    let selectedToothTarget = null;

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
        () => {

            fileInput.click();

        }
    );


    fileInput.addEventListener(
        "change",
        async event => {

            const file =
                event.target.files?.[0];

            if (!file) {
                return;
            }

            await handleFile(
                file
            );

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


    async function handleFile(file) {

        clearError();

        if (!file.type.startsWith("image/")) {

            showError(
                "Please upload a JPG, PNG or WEBP image."
            );

            return;
        }


        if (
            file.size >
            10 * 1024 * 1024
        ) {

            showError(
                "Image is too large. Maximum size is 10 MB."
            );

            return;
        }


        selectedFile = file;


        if (originalImageUrl) {

            URL.revokeObjectURL(
                originalImageUrl
            );

        }


        originalImageUrl =
            URL.createObjectURL(
                file
            );


        previewImage.src =
            originalImageUrl;

        fileThumbnail.src =
            originalImageUrl;


        const dimensions =
            await getImageDimensions(
                file
            );


        fileName.textContent =
            file.name;


        if (
            dimensions.width &&
            dimensions.height
        ) {

            fileMeta.textContent =
                `${formatBytes(file.size)} · ${dimensions.width} × ${dimensions.height} px`;

        } else {

            fileMeta.textContent =
                formatBytes(file.size);

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
                "Full smile analysis is ready. You can now start precise tooth analysis.";


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
        toothVisualizationPreview.src = "";
        toothVisualizationPreview.style.display = "none";
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

        toothSelect.innerHTML =
            "<option value=\"\">Start precise analysis first</option>";
        toothSelect.disabled = true;
        testToothMaskBtn.disabled = true;
        visualizeToothBtn.disabled = true;

        toothMaskMeta.textContent =
            "No precise tooth localization has been performed yet.";
        clearToothReferenceArea();
        toothVisualizationPreview.src = "";
        toothVisualizationPreview.style.display = "none";
        toothMaskStatus.textContent = "";
        toothAnalysisStatus.textContent = "";
        toothAnalysisReport.textContent = "";
        toothMaskResult.classList.remove("visible");

        if (!keepButtonState) {
            startPreciseToothBtn.disabled =
                !(selectedFile && fullSmileAnalysisComplete);

            preciseLocalizationStatus.textContent =
                selectedFile && fullSmileAnalysisComplete
                    ? "Full smile analysis is ready. You can now start precise tooth analysis."
                    : selectedFile
                        ? "Complete the full smile analysis before starting precise tooth analysis."
                        : "Upload an image to begin precise tooth analysis.";
        }
    }


    /* =========================================================
       PRECISE BUTTON STATE
       Precise tooth analysis depends ONLY on successful full
       smile analysis. It must never depend on Generate Visualization.
    ========================================================= */

    function updatePreciseToothButtonState() {

        if (!startPreciseToothBtn) return;

        const ready =
            Boolean(selectedFile) &&
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
        if (!selectedFile) {
            showError("Please upload an original smile photograph first.");
            return;
        }

        if (!fullSmileAnalysisComplete || !analysisReport) {
            showError(
                "Complete the full smile analysis before starting precise tooth analysis."
            );
            return;
        }

        clearError();

        startPreciseToothBtn.disabled = true;
        testToothMaskBtn.disabled = true;
        visualizeToothBtn.disabled = true;
        toothMaskResult.classList.remove("visible");
        preciseLocalizationStatus.textContent =
            "Kimi is locating individually analyzable teeth from the original photograph...";
        statusText.textContent = "Precise tooth localization in progress";

        try {
            const formData = new FormData();
            formData.append("image", selectedFile);

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

            if (preciseLocalizationReady) {
                preciseLocalizationStatus.textContent =
                    `${preciseToothTargets.length} Kimi-approved analyzable tooth${preciseToothTargets.length === 1 ? "" : "s"} found. Select one below for independent verification.`;
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
            visualizeToothBtn.disabled = true;
            toothMaskResult.classList.remove("visible");
            clearToothReferenceArea();
            toothVisualizationPreview.src = "";
            toothVisualizationPreview.style.display = "none";
            toothAnalysisStatus.textContent = "";
            toothAnalysisReport.textContent = "";
            toothMaskStatus.textContent = "";
            updateSelectedToothMeta();
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


    async function analyzeSelectedToothFromUI() {

        if (!selectedFile) {
            showError("Original image is missing.");
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

        // Reuse the existing AI Tooth Localization Reference area.
        // Never create a second shimmer/image panel for subsequent teeth.
        const toothLoadToken = startToothReferenceLoadingState(target.tooth);

        toothAnalysisStatus.textContent =
            `Kimi is independently verifying and analyzing tooth ${target.tooth} from the original photograph...`;
        toothAnalysisReport.textContent = "";
        toothMaskStatus.textContent = "";
        toothVisualizationPreview.src = "";

        try {
            const formData = new FormData();
            formData.append("image", selectedFile);
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
            toothMaskStatus.textContent =
                "Reference image prepared. Review the tooth-specific analysis, then generate the visualization.";
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


    async function visualizeSelectedTooth() {

        if (!selectedFile) {
            showError("Original image is missing.");
            return;
        }

        if (!selectedToothTarget || !selectedToothReport) {
            showError("Analyze and verify the selected tooth first.");
            return;
        }

        clearError();

        visualizeToothBtn.disabled = true;
        toothMaskStatus.textContent =
            `Creating the AI visualization for tooth ${selectedToothTarget.tooth} only...`;

        try {
            const formData = new FormData();
            formData.append("image", selectedFile);
            formData.append("tooth", String(selectedToothTarget.tooth));
            formData.append(
                "payload",
                JSON.stringify({
                    target: selectedToothTarget,
                    toothReport: selectedToothReport
                })
            );

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

            toothVisualizationPreview.onload = () => {
                toothVisualizationPreview.style.display = "block";
            };
            toothVisualizationPreview.src = data.generatedImage;
            toothMaskStatus.textContent =
                `Tooth ${data.tooth} visualization is ready.`;
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


            beforeImage.src =
                originalImageUrl;

            afterImage.src =
                generatedImageUrl;


            resultSection.classList.add(
                "visible"
            );


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
            ? fields.map(([key, value]) => `
                <div class="tooth-report-item">
                    <div class="tooth-report-item-label">
                        ${escapeHtml(formatToothFieldLabel(key))}
                    </div>
                    <div class="tooth-report-item-value">
                        ${escapeHtml(formatToothValue(value))}
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
                    <h4>Summary</h4>
                    <p>${escapeHtml(summary)}</p>
                </section>

                <section class="tooth-report-section">
                    <h4>Assessment</h4>
                    <div class="tooth-report-grid">
                        ${assessmentMarkup}
                    </div>
                </section>

                <section class="tooth-report-section tooth-report-visualization">
                    <h4>Visualization Instructions</h4>
                    <p>${escapeHtml(visualizationInstructions)}</p>
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
                margin: 26px auto 0;
                box-sizing: border-box;
            }

            .tooth-report-card {
                width: min(100%, 1050px);
                margin: 0 auto;
                background: #ffffff;
                border: 1px solid #dce7e2;
                border-radius: 18px;
                overflow: hidden;
                box-sizing: border-box;
            }

            .tooth-report-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 20px;
                padding: 25px 30px;
                background: #f8faf8;
                border-bottom: 1px solid #e2ebe7;
            }

            .tooth-report-kicker {
                margin-bottom: 5px;
                color: #b28d45;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: .14em;
                text-transform: uppercase;
            }

            .tooth-report-title {
                margin: 0;
                color: #123f38;
                font-family: "Cormorant Garamond", Georgia, serif;
                font-size: 29px;
                line-height: 1.1;
                font-weight: 600;
            }

            .tooth-report-confidence {
                display: flex;
                align-items: center;
                gap: 9px;
                padding: 8px 12px;
                border: 1px solid #c8ded7;
                border-radius: 999px;
                background: #edf7f3;
                color: #0b5b4f;
                font-size: 12px;
                white-space: nowrap;
            }

            .tooth-report-confidence span {
                color: #60736d;
            }

            .tooth-report-confidence strong {
                color: #0b5b4f;
            }

            .tooth-report-section {
                padding: 24px 30px;
            }

            .tooth-report-section + .tooth-report-section {
                padding-top: 0;
            }

            .tooth-report-section h4 {
                margin: 0 0 12px;
                color: #123f38;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: .1em;
                text-transform: uppercase;
            }

            .tooth-report-summary p,
            .tooth-report-visualization p {
                max-width: 900px;
                margin: 0;
                color: #31514b;
                font-size: 14px;
                line-height: 1.7;
            }

            .tooth-report-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px 14px;
            }

            .tooth-report-item {
                min-width: 0;
                padding: 15px 17px;
                background: #f8faf9;
                border: 1px solid #e3ece8;
                border-radius: 12px;
            }

            .tooth-report-item-label {
                margin-bottom: 6px;
                color: #60736d;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: .06em;
                text-transform: uppercase;
            }

            .tooth-report-item-value {
                color: #173f3a;
                font-size: 13px;
                line-height: 1.6;
            }

            .tooth-report-visualization {
                margin: 0 30px 28px;
                padding: 19px 21px;
                background: #edf7f3;
                border-left: 3px solid #0b5b4f;
                border-radius: 10px;
            }

            .tooth-report-visualization h4 {
                color: #0b5b4f;
            }

            .tooth-report-empty {
                grid-column: 1 / -1;
                padding: 18px;
                color: #60736d;
                background: #f8faf9;
                border-radius: 12px;
            }

            @media (max-width: 760px) {
                .tooth-report-header {
                    align-items: flex-start;
                    flex-direction: column;
                    padding: 22px;
                }

                .tooth-report-section {
                    padding-left: 22px;
                    padding-right: 22px;
                }

                .tooth-report-grid {
                    grid-template-columns: 1fr;
                }

                .tooth-report-visualization {
                    margin-left: 22px;
                    margin-right: 22px;
                }
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
