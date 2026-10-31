import { beforeEach, describe, expect, it } from "vitest";

import { buildProduct, buildProfile, seedUnitsOfMeasure } from "../test/builders";
import ProductService from "./index";

const productService = new ProductService();

describe("ProductService varieties", () => {
  beforeEach(seedUnitsOfMeasure);

  it("mints the Variety SKU as vr-{slug}-001 from the Product and the Variety display name", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Gokul Milk" });

    const variety = await productService.createProductVariety(
      { productId: product.id, name: "Full Cream", sizeValue: "500", uomCode: "ml" },
      admin.id,
    );

    expect(variety.sku).toBe("vr-gokul-milk-full-cream-500-ml-001");
    expect(variety).toMatchObject({
      name: "Full Cream",
      sizeValue: "500.000",
      uomCode: "ml",
      displayName: "Full Cream 500 ml",
      unit: null,
    });
  });

  it("reads as its size alone when the name is empty, and drops trailing zeros", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Basundi" });

    const sizeOnly = await productService.createProductVariety(
      { productId: product.id, name: "", sizeValue: "500", uomCode: "g" },
      admin.id,
    );
    const decimal = await productService.createProductVariety(
      { productId: product.id, name: "Family", sizeValue: "1.500", uomCode: "kg" },
      admin.id,
    );

    expect(sizeOnly.displayName).toBe("500 g");
    expect(sizeOnly.sku).toBe("vr-basundi-500-g-001");
    expect(decimal.displayName).toBe("Family 1.5 kg");
  });

  it("gives a second Variety with the same slug the next counter", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Gokul Milk" });

    await productService.createProductVariety(
      { productId: product.id, name: "Toned", sizeValue: "500", uomCode: "ml" },
      admin.id,
    );
    const second = await productService.createProductVariety(
      { productId: product.id, name: "Toned-", sizeValue: "500", uomCode: "ml" },
      admin.id,
    );

    expect(second.sku).toBe("vr-gokul-milk-toned-500-ml-002");
  });

  it("allows one name in two sizes, and the same Variety under two Products", async () => {
    const admin = await buildProfile();
    const milk = await buildProduct({ name: "Milk" });
    const curd = await buildProduct({ name: "Curd" });

    const half = await productService.createProductVariety(
      { productId: milk.id, name: "Toned", sizeValue: "500", uomCode: "ml" },
      admin.id,
    );
    const litre = await productService.createProductVariety(
      { productId: milk.id, name: "Toned", sizeValue: "1", uomCode: "L" },
      admin.id,
    );
    const curdLitre = await productService.createProductVariety(
      { productId: curd.id, name: "Toned", sizeValue: "1", uomCode: "L" },
      admin.id,
    );

    expect([half.displayName, litre.displayName]).toEqual(["Toned 500 ml", "Toned 1 L"]);
    expect(curdLitre.sku).toBe("vr-curd-toned-1-l-001");
  });

  it("refuses a second Variety that reads the same under one Product, naming both", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Paneer" });
    await productService.createProductVariety(
      { productId: product.id, name: "", sizeValue: "200", uomCode: "g" },
      admin.id,
    );

    await expect(
      productService.createProductVariety(
        { productId: product.id, name: "", sizeValue: "200.0", uomCode: "g" },
        admin.id,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: 'Product "Paneer" already has a variety named "200 g"',
    });
  });

  it("refuses a unit that is not in Settings, and a size of 0", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Paneer" });

    await expect(
      productService.createProductVariety(
        { productId: product.id, name: "Block", sizeValue: "2", uomCode: "pcs" },
        admin.id,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      productService.createProductVariety(
        { productId: product.id, name: "Block", sizeValue: "0", uomCode: "g" },
        admin.id,
      ),
    ).rejects.toThrow();
  });

  it("keeps the SKU when a Variety is renamed or its size changes", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Ghee" });
    const variety = await productService.createProductVariety(
      { productId: product.id, name: "", sizeValue: "1", uomCode: "kg" },
      admin.id,
    );

    const updated = await productService.updateProductVariety(
      variety.id,
      { name: "Jar", sizeValue: "500", uomCode: "g", sku: "vr-hacked-001" } as never,
      admin.id,
    );

    expect(updated).toMatchObject({ displayName: "Jar 500 g", sku: "vr-ghee-1-kg-001" });
  });

  it("refuses a size change without its unit", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Ghee" });
    const variety = await productService.createProductVariety(
      { productId: product.id, name: "", sizeValue: "1", uomCode: "kg" },
      admin.id,
    );

    await expect(
      productService.updateProductVariety(variety.id, { sizeValue: "2" }, admin.id),
    ).rejects.toThrow();
  });

  it("lists a deactivated Variety for Admin only, and reactivates it", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Curd" });
    const variety = await productService.createProductVariety(
      { productId: product.id, name: "", sizeValue: "1", uomCode: "kg" },
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

describe("ProductService delete", () => {
  it("refuses a second delete of the same Product as not found", async () => {
    const admin = await buildProfile();
    const product = await buildProduct({ name: "Buttermilk" });

    const deleted = await productService.deleteProduct(product.id, admin.id);
    const deletedAgain = await productService.deleteProduct(product.id, admin.id);

    expect(deleted).toMatchObject({ id: product.id, status: "inactive" });
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    expect(deletedAgain).toBeUndefined();
  });
});

describe("ProductService image", () => {
  const image = { imageKey: "products/admin/curd.png", imageUrl: "https://cdn.test/curd.png" };

  it("refuses a Product without an image", async () => {
    const admin = await buildProfile();

    await expect(
      productService.createProduct({ name: "Curd" } as never, admin.id),
    ).rejects.toThrow();
    await expect(
      productService.createProduct({ name: "Curd", imageKey: "", imageUrl: "" }, admin.id),
    ).rejects.toThrow();
  });

  it("creates a Product with its image", async () => {
    const admin = await buildProfile();

    const product = await productService.createProduct({ name: "Curd", ...image }, admin.id);

    expect(product).toMatchObject({ name: "Curd", ...image });
  });

  it("refuses an update that clears the image, or changes only half of it", async () => {
    const admin = await buildProfile();
    const product = await productService.createProduct({ name: "Curd", ...image }, admin.id);

    await expect(
      productService.updateProduct(product.id, { imageKey: "", imageUrl: "" }, admin.id),
    ).rejects.toThrow();
    await expect(
      productService.updateProduct(product.id, { imageKey: "products/admin/other.png" }, admin.id),
    ).rejects.toThrow();
    expect(await productService.getProductById(product.id)).toMatchObject(image);
  });

  it("refuses to remove a Product image", () => {
    expect(() => productService.deleteProductImage()).toThrow(
      "A Product must have an image; upload a new one to replace it",
    );
  });
});
