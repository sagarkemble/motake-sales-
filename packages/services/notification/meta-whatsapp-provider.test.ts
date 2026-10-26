import { describe, expect, it } from "vitest";

import { MetaWhatsAppProvider, META_GRAPH_API_VERSION } from "./index";

// Contract tests against a stubbed fetch with recorded Meta response shapes; never the network.

interface RecordedRequest {
  url: string;
  init: RequestInit;
}

function stubFetch(...responses: (Response | Error)[]) {
  const requests: RecordedRequest[] = [];
  const fetchStub = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("No stubbed response left");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchStub, requests };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function metaError(code: number, message = "Meta error", status = 400): Response {
  return json(status, {
    error: {
      message,
      type: "OAuthException",
      code,
      error_data: { messaging_product: "whatsapp", details: message },
      fbtrace_id: "Abc",
    },
  });
}

const accepted = json(200, {
  messaging_product: "whatsapp",
  contacts: [{ input: "+919800000001", wa_id: "919800000001" }],
  messages: [{ id: "wamid.HBgMOTE5ODAwMDAwMDAxFQIAERgSQ0Y", message_status: "accepted" }],
});

function provider(fetchStub: typeof fetch) {
  return new MetaWhatsAppProvider({
    accessToken: "test-token",
    phoneNumberId: "106540352242922",
    fetch: fetchStub,
  });
}

const baseSend = {
  to: "+919800000001",
  templateName: "motake_bill",
  language: "mr",
  bodyParams: ["Shree Dairy", "MB-26-27-000123"],
};

describe("MetaWhatsAppProvider requests", () => {
  it("pins the Graph version and sends a template without a header", async () => {
    const { fetchStub, requests } = stubFetch(accepted.clone());

    const result = await provider(fetchStub).sendTemplate({ ...baseSend, header: null });

    expect(META_GRAPH_API_VERSION).toBe("v26.0");
    expect(result).toEqual({
      ok: true,
      providerMessageId: "wamid.HBgMOTE5ODAwMDAwMDAxFQIAERgSQ0Y",
    });
    expect(requests[0]!.url).toBe("https://graph.facebook.com/v26.0/106540352242922/messages");
    expect(requests[0]!.init.method).toBe("POST");
    expect(requests[0]!.init.headers).toMatchObject({ Authorization: "Bearer test-token" });
    expect(JSON.parse(requests[0]!.init.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "+919800000001",
      type: "template",
      template: {
        name: "motake_bill",
        language: { code: "mr" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Shree Dairy" },
              { type: "text", text: "MB-26-27-000123" },
            ],
          },
        ],
      },
    });
  });

  it("sends no components for a template with no blanks and no header", async () => {
    const { fetchStub, requests } = stubFetch(accepted.clone());

    await provider(fetchStub).sendTemplate({ ...baseSend, bodyParams: [], header: null });

    expect(JSON.parse(requests[0]!.init.body as string).template).toEqual({
      name: "motake_bill",
      language: { code: "mr" },
    });
  });

  it("sends a document header by media id and file name", async () => {
    const { fetchStub, requests } = stubFetch(accepted.clone());

    await provider(fetchStub).sendTemplate({
      ...baseSend,
      header: {
        type: "document",
        mediaId: "1037543291543636",
        filename: "Motake Bill MB-26-27-000123.pdf",
      },
    });

    expect(JSON.parse(requests[0]!.init.body as string).template.components[0]).toEqual({
      type: "header",
      parameters: [
        {
          type: "document",
          document: { id: "1037543291543636", filename: "Motake Bill MB-26-27-000123.pdf" },
        },
      ],
    });
  });

  it("sends an image header by media id", async () => {
    const { fetchStub, requests } = stubFetch(accepted.clone());

    await provider(fetchStub).sendTemplate({
      ...baseSend,
      header: { type: "image", mediaId: "2037543291543636", filename: "qr.png" },
    });

    expect(JSON.parse(requests[0]!.init.body as string).template.components[0]).toEqual({
      type: "header",
      parameters: [{ type: "image", image: { id: "2037543291543636" } }],
    });
  });

  it("uploads media as multipart with the product, type, file and file name", async () => {
    const { fetchStub, requests } = stubFetch(json(200, { id: "1037543291543636" }));
    const bytes = new TextEncoder().encode("%PDF-1.7 test");

    const result = await provider(fetchStub).uploadMedia({
      bytes,
      mimeType: "application/pdf",
      filename: "Motake Bill MB-26-27-000123.pdf",
    });

    expect(result).toEqual({ ok: true, mediaId: "1037543291543636" });
    expect(requests[0]!.url).toBe("https://graph.facebook.com/v26.0/106540352242922/media");
    const form = requests[0]!.init.body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(form.get("type")).toBe("application/pdf");
    const file = form.get("file") as File;
    expect(file.name).toBe("Motake Bill MB-26-27-000123.pdf");
    expect(file.type).toBe("application/pdf");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });
});

describe("MetaWhatsAppProvider error classification", () => {
  async function sendWith(response: Response | Error) {
    const { fetchStub } = stubFetch(response);
    return provider(fetchStub).sendTemplate({ ...baseSend, header: null });
  }

  it.each([
    [130429, "rate_limited"],
    [131056, "rate_limited"],
    [80007, "rate_limited"],
    [4, "rate_limited"],
    [2, "provider_unavailable"],
    [131016, "provider_unavailable"],
    [133004, "provider_unavailable"],
  ])("treats code %i as transient (%s)", async (code, category) => {
    expect(await sendWith(metaError(code))).toMatchObject({
      ok: false,
      retriable: true,
      category,
      code,
    });
  });

  it.each([
    [190, "auth_error"],
    [10, "auth_error"],
    [200, "auth_error"],
    [299, "auth_error"],
    [131047, "window_closed"],
    [131050, "opted_out_or_blocked"],
    [130403, "opted_out_or_blocked"],
    [132001, "template_error"],
    [132000, "template_error"],
    [131008, "template_error"],
    [131053, "media_error"],
    [131049, "rate_limited"],
  ])("treats code %i as terminal (%s)", async (code, category) => {
    expect(await sendWith(metaError(code))).toMatchObject({
      ok: false,
      retriable: false,
      category,
      code,
    });
  });

  it("treats an unknown code as terminal", async () => {
    expect(await sendWith(metaError(999_999, "Something new"))).toMatchObject({
      ok: false,
      retriable: false,
      category: "unknown",
      code: 999_999,
      message: "Something new",
    });
  });

  it("treats HTTP 5xx without a known code as transient", async () => {
    expect(await sendWith(new Response("Bad gateway", { status: 502 }))).toMatchObject({
      ok: false,
      retriable: true,
      category: "provider_unavailable",
      code: null,
    });
  });

  it("treats a timeout as an ambiguous transient outcome", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    expect(await sendWith(timeout)).toMatchObject({
      ok: false,
      retriable: true,
      category: "ambiguous",
    });
  });

  it("treats a refused connection as transient provider_unavailable", async () => {
    const refused = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    });
    expect(await sendWith(refused)).toMatchObject({
      ok: false,
      retriable: true,
      category: "provider_unavailable",
    });
  });
});
