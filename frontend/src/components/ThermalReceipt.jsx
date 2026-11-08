import { createPortal } from "react-dom";
import { UtensilsCrossed } from "lucide-react";
import { formatThermalReceipt } from "../features/thermalReceipt";
import "./thermalReceipt.css";

// Room the logo takes at the top of the paper, in millimetres.
const LOGO_MM = 16;

/**
 * The 40-column text receipt with the DineFlow logo on top, hidden on
 * screen. printThermalReceipt() prints only this, sized for 80mm paper.
 */
export function ThermalReceipt({ receipt }) {
  if (!receipt) return null;
  // Straight under <body>, so printing can leave everything else out.
  return createPortal(
    <div className="thermal-receipt" aria-hidden="true">
      {/* Solid black mark with the fork and knife cut out: thermal paper
          prints black only. */}
      <span className="thermal-receipt-logo">
        <UtensilsCrossed size={26} strokeWidth={2.4} />
      </span>
      <pre>{formatThermalReceipt(receipt)}</pre>
    </div>,
    document.body,
  );
}

/**
 * Prints the receipt card exactly as it looks on screen (colours included).
 * With `fileName`, the browser's "Save as PDF" suggests that name.
 */
export function printReceiptCard(fileName) {
  const title = document.title;
  if (fileName) document.title = fileName;
  const page = document.createElement("style");
  page.textContent = "@page { size: auto; margin: 12mm; }";
  document.head.append(page);
  document.body.classList.add("printing-card");
  const done = () => {
    document.body.classList.remove("printing-card");
    page.remove();
    document.title = title;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

/** Saves the 40-column text receipt as a .txt file. */
export function downloadReceiptText(receipt, fileName) {
  const text = formatThermalReceipt(receipt);
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName + ".txt";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printThermalReceipt() {
  // 80mm paper only for this print; other printing keeps its own page size.
  // Paper as long as the receipt: about 3.7mm a line at this type size.
  const lines =
    document.querySelector(".thermal-receipt pre")?.textContent.split(/\n/)
      .length || 40;
  const page = document.createElement("style");
  page.textContent = `@page { size: 80mm ${Math.ceil(lines * 3.7 + 10 + LOGO_MM)}mm; margin: 3mm; }`;
  document.head.append(page);
  document.body.classList.add("printing-thermal");
  const done = () => {
    document.body.classList.remove("printing-thermal");
    page.remove();
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}
