(function () {
    const CSS_FILES = [
        "/global.css",
        "/utilityStyle/ai-report.css",
        "/utilityStyle/tooth-analysis.css",
        "/utilityStyle/visualization.css",
        "/utilityStyle/user-upload-ui.css",
        "/app.js",
        "/demo.html",
        "/utilityStyle/precision-tooth-dashboard.css"

    ];

    const CHECK_INTERVAL = 700;

    const loadedCss = {};

    async function loadCssFile(file, index) {
        try {
            const response = await fetch(
                file + "?live=" + Date.now(),
                {
                    cache: "no-store"
                }
            );

            if (!response.ok) {
                console.warn("Could not load:", file);
                return;
            }

            const css = await response.text();

            // Don't update if nothing changed
            if (loadedCss[file] === css) {
                return;
            }

            loadedCss[file] = css;

            const styleId =
                "simoura-live-css-" +
                index;

            let style =
                document.getElementById(styleId);

            if (!style) {
                style = document.createElement("style");

                style.id = styleId;

                document.head.appendChild(style);
            }

            style.textContent = css;

            console.log(
                "SIMOURA UI updated:",
                file
            );

        } catch (error) {
            console.warn(
                "CSS preview error:",
                file,
                error
            );
        }
    }

    async function checkAllCss() {
        for (
            let i = 0;
            i < CSS_FILES.length;
            i++
        ) {
            await loadCssFile(
                CSS_FILES[i],
                i
            );
        }
    }

    // Initial load
    checkAllCss();

    // Watch for changes
    setInterval(
        checkAllCss,
        CHECK_INTERVAL
    );
})();