#!/usr/bin/env node
/**
 * Seed 10 dairy products (+ 2 varieties each) via admin REST APIs.
 * Uploads product images to Cloudflare R2 through presigned URLs.
 *
 * Usage:
 *   SEED_API_BASE_URL=https://motake-back.lunarstudio.dev \
 *   SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... \
 *   dotenv -- node scripts/seed-dairy-products.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apiRequest, getApiBaseUrl, loginWithBackend } from "./lib/api-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, "seed-data", "images");

const API_BASE_URL = getApiBaseUrl();
const ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL || process.env.K6_ADMIN_EMAIL || "team@lunarstudio.dev";
const ADMIN_PASSWORD =
  process.env.SEED_ADMIN_PASSWORD || process.env.K6_ADMIN_PASSWORD || "team@lunarstudio.dev";

const LIQUID_VARIETIES = [
  { name: "Half Liter", unit: "L", skuSuffix: "500ML" },
  { name: "1 Liter", unit: "L", skuSuffix: "1L" },
];

const SOLID_VARIETIES = [
  { name: "Half Kg", unit: "kg", skuSuffix: "500G" },
  { name: "1 Kg", unit: "kg", skuSuffix: "1KG" },
];

const PRODUCTS = [
  {
    code: "COW-MILK",
    name: "Fresh Cow Milk",
    description: "Farm-fresh pasteurized cow milk, packed daily for maximum freshness.",
    type: "liquid",
    imageFile: "cow-milk.png",
  },
  {
    code: "BUFF-MILK",
    name: "Buffalo Milk",
    description: "Rich and creamy buffalo milk with higher fat content, ideal for curd and sweets.",
    type: "liquid",
    imageFile: "buffalo-milk.png",
  },
  {
    code: "CURD",
    name: "Homemade Curd",
    description: "Thick, tangy homemade dahi set in earthen pots using pure milk cultures.",
    type: "solid",
    imageFile: "curd.png",
  },
  {
    code: "PANEER",
    name: "Fresh Paneer",
    description: "Soft cottage cheese cubes made from fresh milk, perfect for curries and snacks.",
    type: "solid",
    imageFile: "paneer.png",
  },
  {
    code: "BUTTER",
    name: "White Butter",
    description: "Traditional hand-churned white butter with rich aroma and creamy texture.",
    type: "solid",
    imageFile: "butter.png",
  },
  {
    code: "GHEE",
    name: "Pure Cow Ghee",
    description: "Golden clarified butter slow-cooked from cow milk cream for authentic flavor.",
    type: "solid",
    imageFile: "ghee.png",
  },
  {
    code: "CHAAS",
    name: "Masala Chaas",
    description: "Refreshing spiced buttermilk blended with cumin, coriander, and rock salt.",
    type: "liquid",
    imageFile: "chaas.png",
  },
  {
    code: "LASSI",
    name: "Sweet Mango Lassi",
    description: "Creamy yogurt drink blended with Alphonso mango pulp and a touch of sugar.",
    type: "liquid",
    imageFile: "lassi.png",
  },
  {
    code: "CREAM",
    name: "Fresh Cream",
    description: "Thick dairy cream skimmed from fresh milk, ideal for desserts and cooking.",
    type: "liquid",
    imageFile: "cream.png",
  },
  {
    code: "CHEESE",
    name: "Processed Cheese Block",
    description: "Mild processed cheese block that slices easily for sandwiches and snacks.",
    type: "solid",
    imageFile: "cheese.png",
  },
];

function assertConfig() {
  const missing = [];
  if (!ADMIN_EMAIL) missing.push("SEED_ADMIN_EMAIL");
  if (!ADMIN_PASSWORD) missing.push("SEED_ADMIN_PASSWORD");
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}

async function authenticateAdmin() {
  return loginWithBackend(ADMIN_EMAIL, ADMIN_PASSWORD, API_BASE_URL);
}

async function uploadProductImage(cookie, imageFile) {
  const imagePath = join(IMAGES_DIR, imageFile);
  const imageBuffer = readFileSync(imagePath);
  const contentType = imageFile.endsWith(".webp")
    ? "image/webp"
    : imageFile.endsWith(".jpg") || imageFile.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";

  const uploadMeta = await apiRequest(cookie, "POST", "/api/products/image-upload-url", {
    fileName: imageFile,
    contentType,
  });

  const putRes = await fetch(uploadMeta.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: imageBuffer,
  });

  if (!putRes.ok) {
    const body = await putRes.text();
    console.warn(
      `\n   ⚠ Image upload failed (${putRes.status}) for ${imageFile} — creating product without image.`,
    );
    console.warn(`   R2 error: ${body.slice(0, 120)}`);
    return null;
  }

  return { imageKey: uploadMeta.imageKey, imageUrl: uploadMeta.imageUrl };
}

async function seedProduct(cookie, productDef) {
  const imageMeta = await uploadProductImage(cookie, productDef.imageFile);

  const productPayload = {
    name: productDef.name,
    description: productDef.description,
    ...(imageMeta ? { imageKey: imageMeta.imageKey, imageUrl: imageMeta.imageUrl } : {}),
  };

  const product = await apiRequest(cookie, "POST", "/api/products/", productPayload);

  const varieties = productDef.type === "liquid" ? LIQUID_VARIETIES : SOLID_VARIETIES;
  const createdVarieties = [];

  for (const variety of varieties) {
    const created = await apiRequest(cookie, "POST", "/api/products/varieties", {
      productId: product.id,
      sku: `MOTAKE-${productDef.code}-${variety.skuSuffix}`,
      name: variety.name,
      unit: variety.unit,
    });
    createdVarieties.push(created);
  }

  return { product, varieties: createdVarieties, imageUrl: imageMeta?.imageUrl ?? null };
}

async function main() {
  assertConfig();
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Admin: ${ADMIN_EMAIL}`);
  console.log(`Seeding ${PRODUCTS.length} dairy products...\n`);

  const cookie = await authenticateAdmin();
  console.log("Authenticated as admin.\n");

  const results = [];

  for (const productDef of PRODUCTS) {
    process.stdout.write(`→ ${productDef.name}... `);
    try {
      const result = await seedProduct(cookie, productDef);
      results.push(result);
      console.log(
        `OK (${result.varieties.length} varieties${result.imageUrl ? `, image: ${result.imageUrl}` : ", no image"})`,
      );
    } catch (error) {
      console.log("FAILED");
      throw error;
    }
  }

  console.log(`\nDone. Created ${results.length} products and ${results.length * 2} varieties.`);
}

main().catch((error) => {
  console.error("\nSeed failed:", error.message);
  process.exit(1);
});
