import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildProfile } from "../test/builders";
import SalesmanService from "./index";

const salesmanService = new SalesmanService();

// 11:30 IST on 31 Oct 2026.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T06:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

async function createSalesman(name: string, phone: string) {
  const profile = await buildProfile();
  return salesmanService.createSalesman({ id: profile.id, name, phone });
}

describe("Salesman code", () => {
  it("is the name's first three letters, the last four phone digits and today's date", async () => {
    const salesman = await createSalesman("Ravi Patil", "+91 98765 44321");

    expect(salesman.salesmanCode).toBe("RAV-4321-261031");
  });

  it("drops accents and non-letters, and uses SM for a name with no ASCII letters", async () => {
    expect((await createSalesman("Ān-and", "9000001111")).salesmanCode).toBe("ANA-1111-261031");
    expect((await createSalesman("रवी", "9000002222")).salesmanCode).toBe("SM-2222-261031");
  });

  it("adds -2, -3 when the same name, phone and day are already taken", async () => {
    const first = await createSalesman("Sunil", "9000003333");
    const second = await createSalesman("Sunita", "9876503333");
    const third = await createSalesman("Sun", "03333");

    expect([first.salesmanCode, second.salesmanCode, third.salesmanCode]).toEqual([
      "SUN-3333-261031",
      "SUN-3333-261031-2",
      "SUN-3333-261031-3",
    ]);
  });
});
