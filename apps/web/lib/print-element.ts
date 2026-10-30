const PRINT_ROOT_ID = "print-root";

/**
 * Opens the browser's print dialog for one element only. A copy goes into a top-level container
 * and globals.css hides everything else while printing, so the page around it leaves no blank
 * pages. The copy is removed once the dialog closes.
 */
export function printElement(elementId: string): void {
  const source = document.getElementById(elementId);
  if (!source) return;
  document.getElementById(PRINT_ROOT_ID)?.remove();
  const printRoot = document.createElement("div");
  printRoot.id = PRINT_ROOT_ID;
  printRoot.appendChild(source.cloneNode(true));
  document.body.appendChild(printRoot);
  document.documentElement.classList.add("printing");

  function cleanUp() {
    printRoot.remove();
    document.documentElement.classList.remove("printing");
    window.removeEventListener("afterprint", cleanUp);
  }
  window.addEventListener("afterprint", cleanUp);
  window.print();
}
