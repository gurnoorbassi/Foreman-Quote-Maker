import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

type PdfItem = { name: string; category: string; quantity: number; unit: string; unitCost: number };
export type PdfQuote = { number: string; customerName: string; customerEmail: string; customerPhone: string; projectAddress: string; projectTitle: string; description: string; scope: string; paymentTerms: string; assumptions: string; exclusions: string; markup: number; contingency: number; tax: number; deposit: number; discount: number; items: PdfItem[] };
export type PdfCompany = { name: string; contactName: string; phone: string; email: string; address: string };

const cash = (value: number) => `$${value.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const split = (text: string, font: PDFFont, size: number, width: number) => { const words = text.split(/\s+/); const lines: string[] = []; let line = ""; for (const word of words) { const next = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; } else line = next; } if (line) lines.push(line); return lines; };

export async function generateQuotePdf(quote: PdfQuote, company: PdfCompany) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.10, 0.12, 0.11), amber = rgb(0.91, 0.66, 0.23), muted = rgb(0.39, 0.43, 0.40), pale = rgb(0.96, 0.96, 0.94);
  let page!: PDFPage; let y = 748;
  const addPage = () => { page = doc.addPage([612, 792]); y = 748; return page; };
  const ensure = (height: number) => { if (y - height < 48) addPage(); };
  const text = (value: string, x: number, size = 10, font = regular, color = dark) => { page.drawText(value, { x, y, size, font, color }); y -= size + 4; };
  const paragraph = (value: string, x: number, width: number, size = 9) => { const lines = split(value || "-", regular, size, width); ensure(lines.length * (size + 4)); for (const line of lines) text(line, x, size, regular, muted); };
  const heading = (value: string) => { ensure(30); y -= 8; text(value, 48, 12, bold, dark); };

  addPage();
  page.drawRectangle({ x: 48, y: 718, width: 34, height: 34, color: amber });
  page.drawText("F", { x: 59, y: 729, size: 14, font: bold, color: dark });
  page.drawText(company.name, { x: 94, y: 738, size: 16, font: bold, color: dark });
  page.drawText("PROFESSIONAL RENOVATION QUOTE", { x: 94, y: 722, size: 7, font: bold, color: muted });
  page.drawText("QUOTE", { x: 504, y: 740, size: 7, font: bold, color: muted });
  page.drawText(quote.number, { x: 462, y: 721, size: 14, font: bold, color: dark });
  page.drawLine({ start: { x: 48, y: 702 }, end: { x: 564, y: 702 }, thickness: 1.5, color: dark });
  y = 675;
  text("PREPARED FOR", 48, 7, bold, muted); text(quote.customerName, 48, 12, bold); paragraph([quote.projectAddress, quote.customerEmail, quote.customerPhone].filter(Boolean).join(" | "), 48, 240, 8);
  y = 675; text("PREPARED BY", 330, 7, bold, muted); text(company.contactName || company.name, 330, 12, bold); paragraph([company.address, company.email, company.phone].filter(Boolean).join(" | "), 330, 234, 8);
  y = 605; page.drawRectangle({ x: 48, y: 535, width: 516, height: 74, color: pale }); y = 588; text("PROJECT", 62, 7, bold, muted); text(quote.projectTitle, 62, 18, bold); paragraph(quote.description, 62, 480, 8);
  y = 515; heading("Scope of work"); paragraph(quote.scope, 48, 516, 9);
  heading("Investment summary");
  ensure(30); page.drawRectangle({ x: 48, y: y - 18, width: 516, height: 24, color: dark }); page.drawText("DESCRIPTION", { x: 58, y: y - 10, size: 7, font: bold, color: rgb(1,1,1) }); page.drawText("CATEGORY", { x: 340, y: y - 10, size: 7, font: bold, color: rgb(1,1,1) }); page.drawText("AMOUNT", { x: 505, y: y - 10, size: 7, font: bold, color: rgb(1,1,1) }); y -= 30;
  for (const item of quote.items) { ensure(32); page.drawText(item.name.slice(0, 52), { x: 58, y, size: 9, font: bold, color: dark }); page.drawText(`${item.quantity} ${item.unit}`, { x: 58, y: y - 12, size: 7, font: regular, color: muted }); page.drawText(item.category.slice(0, 24), { x: 340, y, size: 8, font: regular, color: muted }); const amount = cash(item.quantity * item.unitCost); page.drawText(amount, { x: 554 - bold.widthOfTextAtSize(amount, 9), y, size: 9, font: bold, color: dark }); y -= 27; page.drawLine({ start: { x: 48, y: y + 7 }, end: { x: 564, y: y + 7 }, thickness: .4, color: rgb(.86,.88,.86) }); }
  const subtotal = quote.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0); const markupValue = subtotal * quote.markup / 100; const contingencyValue = subtotal * quote.contingency / 100; const taxable = Math.max(0, subtotal + markupValue + contingencyValue - quote.discount); const taxValue = taxable * quote.tax / 100; const total = taxable + taxValue;
  ensure(105); y -= 5; const totalLine = (label: string, value: number, strong = false) => { const font = strong ? bold : regular; page.drawText(label, { x: 350, y, size: strong ? 11 : 8, font, color: dark }); const valueText = cash(value); page.drawText(valueText, { x: 554 - font.widthOfTextAtSize(valueText, strong ? 11 : 8), y, size: strong ? 11 : 8, font, color: dark }); y -= strong ? 20 : 14; }; totalLine("Direct cost", subtotal); totalLine(`Markup (${quote.markup}%)`, markupValue); totalLine(`Contingency (${quote.contingency}%)`, contingencyValue); if (quote.discount) totalLine("Discount", -quote.discount); totalLine(`Tax (${quote.tax}%)`, taxValue); page.drawLine({ start: { x: 350, y: y + 8 }, end: { x: 564, y: y + 8 }, thickness: 1.2, color: dark }); y -= 8; totalLine("TOTAL", total, true);
  heading("Payment schedule"); paragraph(`${quote.deposit}% deposit (${cash(total * quote.deposit / 100)}) on acceptance. ${quote.paymentTerms}`, 48, 516, 9);
  heading("Assumptions"); paragraph(quote.assumptions, 48, 516, 8);
  heading("Exclusions"); paragraph(quote.exclusions, 48, 516, 8);
  if (y < 115) { addPage(); text("Quote acceptance", 48, 16, bold); paragraph("Signing below confirms acceptance of this quote, its scope, pricing, assumptions, exclusions, and payment terms.", 48, 516, 9); y -= 55; } else y -= 25;
  page.drawLine({ start: { x: 48, y }, end: { x: 260, y }, thickness: .7, color: muted }); page.drawLine({ start: { x: 330, y }, end: { x: 564, y }, thickness: .7, color: muted }); y -= 14; page.drawText("Customer signature", { x: 48, y, size: 7, font: regular, color: muted }); page.drawText("Date", { x: 330, y, size: 7, font: regular, color: muted });
  const pages = doc.getPages(); pages.forEach((pdfPage, index) => { pdfPage.drawText(`${quote.number} | Page ${index + 1} of ${pages.length}`, { x: 48, y: 24, size: 7, font: regular, color: muted }); });
  return doc.save();
}
