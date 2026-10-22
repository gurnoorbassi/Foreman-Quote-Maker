import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, PDFPage } from "pdf-lib";
import { generateQuotePdf } from "../src/lib/pdf/quote.ts";
import { quote } from "./fixtures/quote.ts";

test("generated and edited quote numbers stay inside the PDF header", async (t) => {
  const original = PDFPage.prototype.drawText;
  for (const number of ["Q-2026-FFFFFFFF", "W".repeat(80)]) {
    let numberDrawn = false;
    const mock = t.mock.method(PDFPage.prototype, "drawText", function (this: PDFPage, value: string, options: Parameters<PDFPage["drawText"]>[1]) {
      if (value === number) {
        assert.ok(options?.font && options.size && options.x);
        const rightEdge = options.x + options.font.widthOfTextAtSize(value, options.size);
        assert.ok(options.x >= 414 - 0.001);
        assert.ok(Math.abs(rightEdge - 564) < 0.001);
        numberDrawn = true;
      }
      return original.call(this, value, options);
    });
    const bytes = await generateQuotePdf({
      ...quote, number,
      items: quote.items.map((item) => ({ ...item, quantity: item.qty, unitCost: item.cost })),
    }, { name: "Synthetic company", contactName: "Test contact", phone: "", email: "", address: "" });
    assert.ok(numberDrawn);
    assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1);
    mock.mock.restore();
  }
});
