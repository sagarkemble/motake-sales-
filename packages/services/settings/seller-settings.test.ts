import { db } from "@repo/database";
import { auditLogsTable, sellerSettingsTable } from "@repo/database/schema";
import { beforeEach, describe, expect, it } from "vitest";

import { checkoutRefusalOf } from "../errors";
import { wipeApplicationTables } from "../test/database";
import { buildProfile } from "../test/builders";
import SettingsService from "./index";

const settings = new SettingsService();

const sellerInput = {
  legalName: "MOTAKE MILK AND MILK PRODUCT",
  address: "GAT NO 6, MOTAKE MALA, NANDANI ROAD, JAMBHALI-416121",
  state: "Maharashtra",
  gstin: "27EHCPP4509Q1ZP",
  phone: "9822418224",
  email: "akashpatil8090@gmail.com",
} as const;

// The Seller master is a single row, so every test starts from an empty database.
beforeEach(async () => {
  await wipeApplicationTables();
});

describe("Seller master setup", () => {
  it("offers the ADR-0002 values as setup defaults without writing anything", async () => {
    expect(settings.getSellerSetupDefaults()).toEqual(sellerInput);
    expect(await settings.getSellerSettings()).toBeNull();
    expect(await db.select().from(sellerSettingsTable)).toEqual([]);
  });

  it("refuses to hand out the seller before setup and returns it after", async () => {
    const admin = await buildProfile({ name: "Asha Admin" });

    const refused = await settings.requireSellerSettings().catch((caught: unknown) => caught);
    expect(refused).toMatchObject({ code: "CONFLICT" });
    expect(checkoutRefusalOf(refused)).toEqual({ reason: "seller_master_missing", details: null });
    await settings.setUpSellerSettings(sellerInput, admin.id);

    expect(await settings.requireSellerSettings()).toMatchObject(sellerInput);
  });

  it("creates the one row with e-invoicing on and a created audit row, and refuses a second setup", async () => {
    const admin = await buildProfile({ name: "Asha Admin" });

    const created = await settings.setUpSellerSettings(sellerInput, admin.id);
    await expect(settings.setUpSellerSettings(sellerInput, admin.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(created).toMatchObject({
      ...sellerInput,
      einvoicingRequired: true,
      updatedBy: admin.id,
    });
    expect(await db.select().from(sellerSettingsTable)).toHaveLength(1);
    const history = await settings.listSellerSettingsHistory();
    expect(history).toEqual([
      expect.objectContaining({
        action: "created",
        actorId: admin.id,
        actorName: "Asha Admin",
        reason: null,
        payload: sellerInput,
      }),
    ]);
  });

  it("leaves exactly one row when two setups run at once", async () => {
    const admin = await buildProfile();

    const results = await Promise.allSettled([
      settings.setUpSellerSettings(sellerInput, admin.id),
      settings.setUpSellerSettings(sellerInput, admin.id),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    expect(await db.select().from(sellerSettingsTable)).toHaveLength(1);
    expect(await db.select().from(auditLogsTable)).toHaveLength(1);
  });

  it("refuses to choose when the table somehow holds two rows", async () => {
    const admin = await buildProfile();
    await db.insert(sellerSettingsTable).values([
      { ...sellerInput, updatedBy: admin.id },
      { ...sellerInput, updatedBy: admin.id },
    ]);

    await expect(settings.getSellerSettings()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("trims and upper-cases the GSTIN before checking it, on setup and on update", async () => {
    const admin = await buildProfile();

    const created = await settings.setUpSellerSettings(
      { ...sellerInput, gstin: "  27ehcpp4509q1zp " },
      admin.id,
    );
    expect(created.gstin).toBe("27EHCPP4509Q1ZP");

    const updated = await settings.updateSellerSettings(
      { state: "Karnataka", gstin: "29ehcpp4509q1zp" },
      admin.id,
    );
    expect(updated.gstin).toBe("29EHCPP4509Q1ZP");

    // The same GSTIN in lowercase is no change.
    const auditsBefore = (await db.select().from(auditLogsTable)).length;
    await settings.updateSellerSettings({ gstin: "29ehcpp4509q1zp" }, admin.id);
    expect(await db.select().from(auditLogsTable)).toHaveLength(auditsBefore);
  });

  it("refuses a GSTIN with the wrong length, shape or state code, and keeps email optional", async () => {
    const admin = await buildProfile();

    await expect(
      settings.setUpSellerSettings({ ...sellerInput, gstin: "27EHCPP4509Q1Z" }, admin.id),
    ).rejects.toThrow();
    await expect(
      settings.setUpSellerSettings({ ...sellerInput, gstin: "27EHCPP45091QZP" }, admin.id),
    ).rejects.toThrow();
    await expect(
      settings.setUpSellerSettings({ ...sellerInput, state: "Karnataka" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      settings.setUpSellerSettings({ ...sellerInput, state: "maharashtra" as never }, admin.id),
    ).rejects.toThrow();
    expect(await db.select().from(sellerSettingsTable)).toEqual([]);

    const { email: _email, ...withoutEmail } = sellerInput;
    const created = await settings.setUpSellerSettings(withoutEmail, admin.id);
    expect(created.email).toBeNull();
  });
});

describe("Seller master edits", () => {
  it("records only the changed field with old and new values", async () => {
    const admin = await buildProfile();
    const editor = await buildProfile({ name: "Ravi Admin" });
    await settings.setUpSellerSettings(sellerInput, admin.id);

    const updated = await settings.updateSellerSettings(
      { ...sellerInput, phone: "9000000001" },
      editor.id,
    );

    expect(updated).toMatchObject({ phone: "9000000001", updatedBy: editor.id });
    const [latest] = await settings.listSellerSettingsHistory();
    expect(latest).toMatchObject({
      action: "updated",
      actorId: editor.id,
      actorName: "Ravi Admin",
      reason: null,
      payload: { phone: { old: "9822418224", new: "9000000001" } },
    });
  });

  it("writes nothing when nothing changed or validation fails", async () => {
    const admin = await buildProfile();
    const created = await settings.setUpSellerSettings(sellerInput, admin.id);

    const unchanged = await settings.updateSellerSettings({ ...sellerInput }, admin.id);
    await expect(
      settings.updateSellerSettings({ gstin: "29EHCPP4509Q1ZP" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      settings.updateSellerSettings({ state: "Karnataka" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      settings.updateSellerSettings({ email: "not-an-email" }, admin.id),
    ).rejects.toThrow();

    expect(unchanged.updatedAt).toEqual(created.updatedAt);
    expect(await settings.getSellerSettings()).toEqual(created);
    expect(await settings.listSellerSettingsHistory()).toHaveLength(1);
  });

  it("changes state and GSTIN together, clears email, and never touches e-invoicing", async () => {
    const admin = await buildProfile();
    await settings.setUpSellerSettings(sellerInput, admin.id);

    const updated = await settings.updateSellerSettings(
      {
        state: "Karnataka",
        gstin: "29EHCPP4509Q1ZP",
        email: null,
        einvoicingRequired: false,
      } as never,
      admin.id,
    );

    expect(updated).toMatchObject({
      state: "Karnataka",
      gstin: "29EHCPP4509Q1ZP",
      email: null,
      einvoicingRequired: true,
    });
    const [latest] = await settings.listSellerSettingsHistory();
    expect(latest?.payload).toEqual({
      state: { old: "Maharashtra", new: "Karnataka" },
      gstin: { old: "27EHCPP4509Q1ZP", new: "29EHCPP4509Q1ZP" },
      email: { old: "akashpatil8090@gmail.com", new: null },
    });
  });

  it("refuses an edit before setup", async () => {
    const admin = await buildProfile();

    await expect(
      settings.updateSellerSettings({ phone: "9000000001" }, admin.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Seller master not set up" });
  });
});

describe("Seller document details", () => {
  const documentDetails = {
    pan: "EHCPP4509Q",
    bankAccountName: "MOTAKE MILK AND MILK PRODUCTS",
    bankName: "BANK OF INDIA",
    bankBranch: "JAYSINGPUR",
    bankAccountNumber: "091920110000529",
    bankIfsc: "BKID0000919",
    terms: "1. Please verify quantities at delivery.\n2. Refrigerate where required.",
    place: "Jambhali, Maharashtra",
  };

  it("leaves every document detail empty when setup gives none", async () => {
    const admin = await buildProfile();

    const created = await settings.setUpSellerSettings(sellerInput, admin.id);

    expect(created).toMatchObject({
      pan: null,
      bankAccountName: null,
      bankName: null,
      bankBranch: null,
      bankAccountNumber: null,
      bankIfsc: null,
      terms: null,
      place: null,
    });
  });

  it("saves PAN and IFSC upper-cased, trims each term line, and audits old and new values", async () => {
    const admin = await buildProfile();
    await settings.setUpSellerSettings(sellerInput, admin.id);

    const updated = await settings.updateSellerSettings(
      {
        ...documentDetails,
        pan: " ehcpp4509q ",
        bankIfsc: "bkid0000919",
        terms:
          "  1. Please verify quantities at delivery.  \r\n\n 2. Refrigerate where required.\n",
      },
      admin.id,
    );

    expect(updated).toMatchObject(documentDetails);
    const [latest] = await settings.listSellerSettingsHistory();
    expect(latest).toMatchObject({ action: "updated", reason: null });
    expect(latest?.payload).toEqual({
      pan: { old: null, new: "EHCPP4509Q" },
      bankAccountName: { old: null, new: "MOTAKE MILK AND MILK PRODUCTS" },
      bankName: { old: null, new: "BANK OF INDIA" },
      bankBranch: { old: null, new: "JAYSINGPUR" },
      bankAccountNumber: { old: null, new: "091920110000529" },
      bankIfsc: { old: null, new: "BKID0000919" },
      terms: { old: null, new: documentDetails.terms },
      place: { old: null, new: "Jambhali, Maharashtra" },
    });
  });

  it("takes the details at setup and records them in the created audit row", async () => {
    const admin = await buildProfile();

    const created = await settings.setUpSellerSettings(
      { ...sellerInput, ...documentDetails },
      admin.id,
    );

    expect(created).toMatchObject(documentDetails);
    const [history] = await settings.listSellerSettingsHistory();
    expect(history?.payload).toEqual({ ...sellerInput, ...documentDetails });
  });

  it("clears a detail saved blank, and records nothing when the same details are saved again", async () => {
    const admin = await buildProfile();
    await settings.setUpSellerSettings({ ...sellerInput, ...documentDetails }, admin.id);

    await settings.updateSellerSettings({ ...documentDetails }, admin.id);
    expect(await settings.listSellerSettingsHistory()).toHaveLength(1);

    const cleared = await settings.updateSellerSettings(
      { bankBranch: "  ", terms: "\n" },
      admin.id,
    );

    expect(cleared).toMatchObject({ bankBranch: null, terms: null, bankName: "BANK OF INDIA" });
    const [latest] = await settings.listSellerSettingsHistory();
    expect(latest?.payload).toEqual({
      bankBranch: { old: "JAYSINGPUR", new: null },
      terms: { old: documentDetails.terms, new: null },
    });
  });

  it("refuses a PAN or IFSC of the wrong shape, a PAN that is not in the GSTIN, and a bad account number", async () => {
    const admin = await buildProfile();
    const created = await settings.setUpSellerSettings(sellerInput, admin.id);

    await expect(settings.updateSellerSettings({ pan: "EHCPP4509" }, admin.id)).rejects.toThrow(
      /Not a valid PAN/,
    );
    await expect(
      settings.updateSellerSettings({ bankIfsc: "BKID1000919" }, admin.id),
    ).rejects.toThrow(/Not a valid IFSC/);
    await expect(
      settings.updateSellerSettings({ bankAccountNumber: "0919-2011" }, admin.id),
    ).rejects.toThrow(/6 to 34 digits/);
    await expect(
      settings.updateSellerSettings({ pan: "ABCDE1234F" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      settings.setUpSellerSettings({ ...sellerInput, pan: "ABCDE1234F" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await settings.getSellerSettings()).toEqual(created);
    expect(await settings.listSellerSettingsHistory()).toHaveLength(1);
  });

  it("refuses a GSTIN change that no longer contains the saved PAN", async () => {
    const admin = await buildProfile();
    await settings.setUpSellerSettings({ ...sellerInput, pan: "EHCPP4509Q" }, admin.id);

    await expect(
      settings.updateSellerSettings({ gstin: "27ABCDE1234F1Z5" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
