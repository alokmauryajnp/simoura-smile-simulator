const imageInput =
    document.getElementById("imageInput");

const browseButton =
    document.getElementById("browseButton");

const dropZone =
    document.getElementById("dropZone");

const previewContainer =
    document.getElementById("previewContainer");

const previewImage =
    document.getElementById("previewImage");

const fileName =
    document.getElementById("fileName");

const fileSize =
    document.getElementById("fileSize");

const removeImage =
    document.getElementById("removeImage");

const analyzeButton =
    document.getElementById("analyzeButton");

const uploadSection =
    document.getElementById("uploadSection");

const processingSection =
    document.getElementById("processingSection");

const reportSection =
    document.getElementById("reportSection");

const resultSection =
    document.getElementById("resultSection");

const generateButton =
    document.getElementById("generateButton");

const startAgainButton =
    document.getElementById("startAgainButton");

const errorMessage =
    document.getElementById("errorMessage");

const processingTitle =
    document.getElementById("processingTitle");

const processingDescription =
    document.getElementById("processingDescription");

const progressBar =
    document.getElementById("progressBar");

const step1 =
    document.getElementById("step1");

const step2 =
    document.getElementById("step2");

const step3 =
    document.getElementById("step3");

const reportSummary =
    document.getElementById("reportSummary");

const observationsList =
    document.getElementById("observationsList");

const characteristicsList =
    document.getElementById("characteristicsList");

const treatmentsList =
    document.getElementById("treatmentsList");

const originalResultImage =
    document.getElementById("originalResultImage");

const generatedResultImage =
    document.getElementById("generatedResultImage");


let selectedFile = null;
let simulationResult = null;


/*
|--------------------------------------------------------------------------
| File selection
|--------------------------------------------------------------------------
*/

browseButton.addEventListener(
    "click",
    () => {
        imageInput.click();
    }
);


dropZone.addEventListener(
    "click",
    (event) => {

        if (
            event.target === browseButton
        ) {
            return;
        }

        imageInput.click();
    }
);


imageInput.addEventListener(
    "change",
    () => {

        if (imageInput.files.length > 0) {

            handleFile(
                imageInput.files[0]
            );

        }

    }
);


/*
|--------------------------------------------------------------------------
| Drag and drop
|--------------------------------------------------------------------------
*/

dropZone.addEventListener(
    "dragover",
    (event) => {

        event.preventDefault();

        dropZone.classList.add(
            "dragging"
        );
    }
);


dropZone.addEventListener(
    "dragleave",
    () => {

        dropZone.classList.remove(
            "dragging"
        );

    }
);


dropZone.addEventListener(
    "drop",
    (event) => {

        event.preventDefault();

        dropZone.classList.remove(
            "dragging"
        );

        const file =
            event.dataTransfer.files[0];

        if (file) {
            handleFile(file);
        }

    }
);


/*
|--------------------------------------------------------------------------
| Handle image
|--------------------------------------------------------------------------
*/

function handleFile(file) {

    if (!file.type.startsWith("image/")) {

        showError(
            "Please upload a JPG or PNG image."
        );

        return;
    }


    if (
        file.size >
        10 * 1024 * 1024
    ) {

        showError(
            "Image must be smaller than 10 MB."
        );

        return;
    }


    selectedFile = file;


    const reader =
        new FileReader();


    reader.onload = function(event) {

        previewImage.src =
            event.target.result;

        previewContainer
            .classList
            .remove("hidden");

        dropZone
            .classList
            .add("hidden");

        analyzeButton
            .classList
            .remove("hidden");

        fileName.textContent =
            file.name;

        fileSize.textContent =
            formatFileSize(file.size);

    };


    reader.readAsDataURL(file);
}


/*
|--------------------------------------------------------------------------
| Remove image
|--------------------------------------------------------------------------
*/

removeImage.addEventListener(
    "click",
    () => {

        selectedFile = null;

        imageInput.value = "";

        previewContainer
            .classList
            .add("hidden");

        analyzeButton
            .classList
            .add("hidden");

        dropZone
            .classList
            .remove("hidden");

    }
);


/*
|--------------------------------------------------------------------------
| Analyze
|--------------------------------------------------------------------------
*/

analyzeButton.addEventListener(
    "click",
    async () => {

        if (!selectedFile) {
            return;
        }

        showProcessing();

        const formData =
            new FormData();

        formData.append(
            "image",
            selectedFile
        );


        try {

            /*
            We send the image to our own backend.
            API keys never reach the browser.
            */

            const response =
                await fetch(
                    "/api/simulate",
                    {
                        method: "POST",
                        body: formData
                    }
                );


            const result =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    typeof result.error === "string"
                        ? result.error
                        : "Simulation failed."
                );
            }


            simulationResult =
                result;


            showReport(
                result.report
            );


        } catch (error) {

            console.error(error);

            showError(
                error.message ||
                "Something went wrong."
            );

            resetToUpload();
        }

    }
);


/*
|--------------------------------------------------------------------------
| Processing UI
|--------------------------------------------------------------------------
*/

function showProcessing() {

    uploadSection
        .classList
        .add("hidden");

    reportSection
        .classList
        .add("hidden");

    resultSection
        .classList
        .add("hidden");

    processingSection
        .classList
        .remove("hidden");


    step1.classList.add("active");

    step2.classList.remove("active");

    step3.classList.remove("active");

    progressBar.style.width = "20%";


    processingTitle.textContent =
        "Analyzing your smile";

    processingDescription.textContent =
        "Examining visible dental characteristics...";


    setTimeout(() => {

        step2.classList.add("active");

        progressBar.style.width =
            "45%";

        processingTitle.textContent =
            "Preparing your treatment plan";

        processingDescription.textContent =
            "Identifying potential aesthetic improvements...";

    }, 3500);


    setTimeout(() => {

        step3.classList.add("active");

        progressBar.style.width =
            "70%";

        processingTitle.textContent =
            "Creating your smile simulation";

        processingDescription.textContent =
            "Preparing a realistic visualization...";

    }, 7000);
}


/*
|--------------------------------------------------------------------------
| Report
|--------------------------------------------------------------------------
*/

function showReport(report) {

    processingSection
        .classList
        .add("hidden");

    reportSection
        .classList
        .remove("hidden");


    reportSummary.textContent =
        report?.summary ||
        "No summary available.";


    /*
    Observations
    */

    observationsList.innerHTML = "";


    const observations =
        report?.observations || [];


    observations.forEach(
        (observation) => {

            const element =
                document.createElement("div");

            element.className =
                "observation";

            element.textContent =
                observation;

            observationsList
                .appendChild(element);
        }
    );


    /*
    Characteristics
    */

    characteristicsList.innerHTML = "";


    const characteristics =
        report?.smile_characteristics || {};


    const labels = {

        alignment: "Alignment",

        crowding: "Crowding",

        tooth_shade: "Tooth shade",

        smile_arc: "Smile arc",

        gum_display: "Gum display",

        tooth_proportions:
            "Tooth proportions"
    };


    Object.entries(labels)
        .forEach(
            ([key, label]) => {

                if (
                    characteristics[key] ===
                    undefined
                ) {
                    return;
                }


                const row =
                    document.createElement("div");

                row.className =
                    "characteristic";


                const name =
                    document.createElement("span");

                name.textContent =
                    label;


                const value =
                    document.createElement("span");

                value.textContent =
                    characteristics[key];


                row.appendChild(name);

                row.appendChild(value);

                characteristicsList
                    .appendChild(row);

            }
        );


    /*
    Treatments
    */

    treatmentsList.innerHTML = "";


    const treatments =
        report?.treatment_options || [];


    treatments.forEach(
        (treatment) => {

            const element =
                document.createElement("div");

            element.className =
                "treatment";


            const name =
                document.createElement("div");

            name.className =
                "treatment-name";

            name.textContent =
                treatment.name;


            const reason =
                document.createElement("div");

            reason.className =
                "treatment-reason";

            reason.textContent =
                treatment.reason;


            element.appendChild(name);

            element.appendChild(reason);


            treatmentsList
                .appendChild(element);

        }
    );


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/*
|--------------------------------------------------------------------------
| Generate result
|--------------------------------------------------------------------------
*/

generateButton.addEventListener(
    "click",
    async () => {

        if (!simulationResult) {
            return;
        }


        /*
        The backend currently performs the image
        generation as part of /api/simulate.
        */

        if (
            !simulationResult.generatedImage
        ) {

            showError(
                "The image simulation was not returned."
            );

            return;
        }


        showResult();

    }
);


/*
|--------------------------------------------------------------------------
| Result
|--------------------------------------------------------------------------
*/

function showResult() {

    reportSection
        .classList
        .add("hidden");

    resultSection
        .classList
        .remove("hidden");


    originalResultImage.src =
        URL.createObjectURL(
            selectedFile
        );


    generatedResultImage.src =
        simulationResult.generatedImage;


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/*
|--------------------------------------------------------------------------
| Start again
|--------------------------------------------------------------------------
*/

startAgainButton.addEventListener(
    "click",
    () => {

        resetToUpload();

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    }
);


function resetToUpload() {

    selectedFile = null;

    simulationResult = null;

    imageInput.value = "";

    processingSection
        .classList
        .add("hidden");

    reportSection
        .classList
        .add("hidden");

    resultSection
        .classList
        .add("hidden");

    uploadSection
        .classList
        .remove("hidden");

    previewContainer
        .classList
        .add("hidden");

    analyzeButton
        .classList
        .add("hidden");

    dropZone
        .classList
        .remove("hidden");
}


/*
|--------------------------------------------------------------------------
| Utilities
|--------------------------------------------------------------------------
*/

function formatFileSize(bytes) {

    if (bytes < 1024 * 1024) {

        return (
            bytes / 1024
        ).toFixed(1) + " KB";

    }

    return (
        bytes / 1024 / 1024
    ).toFixed(2) + " MB";
}


function showError(message) {

    errorMessage.textContent =
        message;

    errorMessage
        .classList
        .remove("hidden");


    setTimeout(() => {

        errorMessage
            .classList
            .add("hidden");

    }, 7000);
}