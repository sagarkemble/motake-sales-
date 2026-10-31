import { listAuditLogsForEntity } from "@repo/database/queries/audit";
import { describe, expect, it } from "vitest";

import { buildProfile, seedUnitsOfMeasure } from "../test/builders";
import ProductService from "./index";

const productService = new ProductService();
const butterImage = {
  imageKey: "products/admin/butter.png",
  imageUrl: "https://cdn.test/butter.png",
};

describe("ProductService audit", () => {
  it("records each Product write once with the actor and changed fields only", async () => {
    const admin = await buildProfile();

    const product = await productService.createProduct(
      { name: "Butter", imageKey: butterImage.imageKey, imageUrl: butterImage.imageUrl },
      admin.id,
    );
    await productService.updateProduct(product.id, { name: "Salted Butter" }, admin.id);
    await productService.deactivateProduct(product.id, admin.id);
    await productService.reactivateProduct(product.id, admin.id);
    await productService.deleteProduct(product.id, admin.id);

    const rows = await listAuditLogsForEntity("product", product.id);
    const byAction = Object.fromEntries(rows.map((row) => [row.action, row]));
    expect(rows.map((row) => row.action).sort()).toEqual(
      ["activated", "created", "deactivated", "deleted", "updated"].sort(),
    );
    expect(rows.every((row) => row.actorId === admin.id && row.reason === null)).toBe(true);
    expect(byAction.created?.payload).toEqual({ name: "Butter", ...butterImage });
    expect(byAction.updated?.payload).toEqual({ name: { from: "Butter", to: "Salted Butter" } });
    expect(rows.every((row) => row.customerId === null)).toBe(true);
  });

  it("records Variety create, update, deactivate and reactivate under product_variety", async () => {
    const admin = await buildProfile();
    const product = await productService.createProduct(
      {
        name: "Lassi",
        imageKey: "products/admin/lassi.png",
        imageUrl: "https://cdn.test/lassi.png",
      },
      admin.id,
    );

    await seedUnitsOfMeasure();
    const variety = await productService.createProductVariety(
      { productId: product.id, name: "Malai", sizeValue: "200", uomCode: "ml" },
      admin.id,
    );
    await productService.updateProductVariety(variety.id, { name: "Plain" }, admin.id);
    await productService.updateProductVariety(variety.id, { name: "Plain" }, admin.id);
    await productService.deactivateProductVariety(variety.id, admin.id);
    await productService.reactivateProductVariety(variety.id, admin.id);

    const rows = await listAuditLogsForEntity("product_variety", variety.id);
    expect(rows.map((row) => row.action).sort()).toEqual([
      "activated",
      "created",
      "deactivated",
      "updated",
    ]);
    const created = rows.find((row) => row.action === "created");
    const updated = rows.find((row) => row.action === "updated");
    expect(created?.payload).toEqual({
      productId: product.id,
      name: "Malai",
      sizeValue: "200",
      uomCode: "ml",
      sku: "vr-lassi-malai-200-ml-001",
    });
    expect(updated?.payload).toEqual({ name: { from: "Malai", to: "Plain" } });
  });
});
