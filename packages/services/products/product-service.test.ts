import { describe, expect, it } from "vitest";

import { buildProduct, buildProfile } from "../test/builders";
import ProductService from "./index";

const productService = new ProductService();

describe("ProductService varieties", () => {
  it("mints the Variety SKU as vr-{slug}-001 from Product and Variety names", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Gokul Milk" });

    const variety = await productService.createProductVariety(
      { productId: product.id, name: "Full Cream 500 ml", unit: "pouch" },
      admin.id,
    );

    expect(variety.sku).toBe("vr-gokul-milk-full-cream-500-ml-001");
    expect(variety.name).toBe("Full Cream 500 ml");
    expect(variety.unit).toBe("pouch");
  });

  it("gives a second Variety with the same slug the next counter", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Gokul Milk" });

    await productService.createProductVariety(
      { productId: product.id, name: "Toned 500 ml", unit: "pouch" },
      admin.id,
    );
    const second = await productService.createProductVariety(
      { productId: product.id, name: "Toned 500-ml", unit: "pouch" },
      admin.id,
    );

    expect(second.sku).toBe("vr-gokul-milk-toned-500-ml-002");
  });

  it("allows the same Variety name under two Products", async () => {
    const admin = await buildProfile();
    const milk = await buildProduct({ name: "Milk" });
    const curd = await buildProduct({ name: "Curd" });

    const milkLitre = await productService.createProductVariety(
      { productId: milk.id, name: "1 L", unit: "pouch" },
      admin.id,
    );
    const curdLitre = await productService.createProductVariety(
      { productId: curd.id, name: "1 L", unit: "tub" },
      admin.id,
    );

    expect(milkLitre.sku).toBe("vr-milk-1-l-001");
    expect(curdLitre.sku).toBe("vr-curd-1-l-001");
  });

  it("refuses a second Variety with the same name under one Product, naming both", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Paneer" });
    await productService.createProductVariety(
      { productId: product.id, name: "200 g", unit: "pack" },
      admin.id,
    );

    await expect(
      productService.createProductVariety(
        { productId: product.id, name: "200 g", unit: "box" },
        admin.id,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: 'Product "Paneer" already has a variety named "200 g"',
    });
  });

  it("keeps the SKU when a Variety is renamed or its unit changes", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Ghee" });
    const variety = await productService.createProductVariety(
      { productId: product.id, name: "1 kg", unit: "tin" },
      admin.id,
    );

    const updated = await productService.updateProductVariety(
      variety.id,
      { name: "1 kg jar", unit: "jar", sku: "vr-hacked-001" } as never,
      admin.id,
    );

    expect(updated).toMatchObject({ name: "1 kg jar", unit: "jar", sku: "vr-ghee-1-kg-001" });
  });

  it("lists a deactivated Variety for Admin only, and reactivates it", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Curd" });
    const variety = await productService.createProductVariety(
      { productId: product.id, name: "1 kg", unit: "tub" },
      admin.id,
    );
    await productService.deactivateProductVariety(variety.id, admin.id);

    expect(await productService.listVarietiesForProduct(product.id)).toEqual([]);
    expect(
      await productService.listVarietiesForProduct(product.id, { includeInactive: true }),
    ).toEqual([expect.objectContaining({ id: variety.id, status: "inactive" })]);

    const reactivated = await productService.reactivateProductVariety(variety.id, admin.id);

    expect(reactivated).toMatchObject({ id: variety.id, status: "active", deletedAt: null });
    expect(await productService.listVarietiesForProduct(product.id)).toEqual([
      expect.objectContaining({ id: variety.id, status: "active" }),
    ]);
  });
});
