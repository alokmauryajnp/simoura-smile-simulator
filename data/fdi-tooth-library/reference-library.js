// Simoura FDI Tooth Reference Library - reference-image loading fix
// CommonJS; no additional dependencies.
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "teeth.json");
const LIBRARY_DIR = __dirname;
let cache = null;

function loadDatabase() {
  if (!cache) {
    cache = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!Array.isArray(cache.teeth) || cache.teeth.length !== 32) {
      throw new Error("Invalid Simoura FDI reference database: expected 32 permanent teeth.");
    }
  }
  return cache;
}

function normalizeFdi(value) {
  const fdi = String(value ?? "").trim();
  return /^[1-4][1-8]$/.test(fdi) ? fdi : null;
}

function resolveAssetPath(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const candidates = [];
  if (path.isAbsolute(raw)) candidates.push(raw);
  else candidates.push(path.resolve(LIBRARY_DIR, raw));

  // Compatibility with the earlier flat assets/11 layout and accidental double
  // extensions such as oval-front.png.png. Prefer the metadata's exact path first.
  const normalized = raw.replace(/[\\/]+/g, "/");
  const filename = path.basename(normalized);
  const directory = path.dirname(normalized);
  if (directory.includes("/variants")) {
    candidates.push(path.resolve(LIBRARY_DIR, directory.replace(/\/variants$/, ""), filename));
  }
  if (filename.toLowerCase().endsWith(".png")) {
    const doubled = `${filename}.png`;
    candidates.push(path.resolve(LIBRARY_DIR, directory, doubled));
    if (directory.includes("/variants")) {
      candidates.push(path.resolve(LIBRARY_DIR, directory.replace(/\/variants$/, ""), doubled));
    }
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch (_) {
      // Continue checking fallback paths.
    }
  }
  return null;
}

function getToothReference(fdiValue) {
  const fdi = normalizeFdi(fdiValue);
  if (!fdi) throw new Error("Invalid FDI number. Expected a permanent tooth such as 11, 21, 36, or 48.");

  const db = loadDatabase();
  const tooth = db.teeth.find((item) => String(item.fdi) === fdi);
  if (!tooth) throw new Error(`FDI tooth ${fdi} is not present in the reference database.`);

  const images = {};
  for (const [view, relativePath] of Object.entries(tooth.reference_images || {})) {
    images[view] = resolveAssetPath(relativePath);
  }

  const variants = (Array.isArray(tooth.shape_variants) ? tooth.shape_variants : []).map((variant) => {
    const configuredPath = variant?.image || variant?.path || "";
    return {
      ...variant,
      configured_image: configuredPath || null,
      image: resolveAssetPath(configuredPath)
    };
  });

  const hasUsableReferenceImage =
    Object.values(images).some(Boolean) || variants.some((variant) => Boolean(variant.image));

  return {
    ...tooth,
    reference_images: images,
    shape_variants: variants,
    hasUsableReferenceImage
  };
}

function buildReferenceGuidance(tooth, customPrompt = "") {
  const userInstruction = String(customPrompt || "").trim().slice(0, 1200);
  const variantGuidance = (Array.isArray(tooth.shape_variants) ? tooth.shape_variants : [])
    .filter((variant) => variant?.image)
    .map((variant) => `- Available ${variant.label || variant.id || "shape"} reference image: ${variant.id || variant.label || "shape variant"}. Treat this as morphology guidance, not a literal paste-in.`);

  return [
    `TARGET TOOTH: FDI ${tooth.fdi} (${tooth.universal_name}; type: ${tooth.tooth_type}).`,
    "Use the supplied FDI reference only as anatomical guidance for the target tooth's morphology.",
    "Adapt the reference to the patient's actual perspective, scale, lighting, tooth position, and neighboring anatomy; do not paste or clone the reference literally.",
    "Preserve the patient's identity and all non-target regions. Do not change adjacent teeth, gingiva, lips, skin, or background.",
    "Do not infer clinical measurements from missing metadata. Reference landmarks and proportions are usable only after they have been populated and validated.",
    variantGuidance.length ? `AVAILABLE SHAPE VARIANTS:\n${variantGuidance.join("\n")}` : "No shape-variant image files are currently available.",
    userInstruction ? `USER-REQUESTED TARGET-TOOTH CHANGE (subject to the preservation constraints above): ${userInstruction}` : ""
  ].filter(Boolean).join("\n");
}

module.exports = { loadDatabase, normalizeFdi, resolveAssetPath, getToothReference, buildReferenceGuidance };
