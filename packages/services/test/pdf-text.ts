import { extractText, getDocumentProxy } from "unpdf";

// The text a reader sees in a PDF, one string per page, line wraps read as spaces.
export async function printedPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((page) => page.replace(/\s+/g, " "));
}

export async function printedText(bytes: Uint8Array): Promise<string> {
  return (await printedPages(bytes)).join(" ");
}
