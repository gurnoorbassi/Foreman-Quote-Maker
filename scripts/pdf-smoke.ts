import { writeFile } from "node:fs/promises";
import { generateQuotePdf } from "../src/lib/pdf/quote";

async function main() {
const bytes = await generateQuotePdf({
  number: "Q-2026-TEST", customerName: "Sample Customer", customerEmail: "customer@example.com", customerPhone: "604-555-0100", projectAddress: "123 Test Street, Vancouver, BC", projectTitle: "Main floor renovation", description: "A complete renovation covering flooring, paint, lighting, and finish carpentry.", scope: "Protect existing surfaces. Remove old flooring. Supply and install new flooring and baseboards. Prepare and paint walls. Complete final cleanup.", paymentTerms: "30% deposit, 40% at midpoint, and the balance after final walkthrough.", assumptions: "Normal weekday access and structurally sound existing surfaces.", exclusions: "Permits, hazardous materials, and concealed damage.", markup: 18, contingency: 5, tax: 5, deposit: 30, discount: 250,
  items: [
    { name: "Flooring materials", category: "Materials", quantity: 900, unit: "sq ft", unitCost: 4.5 },
    { name: "Flooring installation", category: "Labour", quantity: 900, unit: "sq ft", unitCost: 2.25 },
    { name: "Interior painting", category: "Labour", quantity: 48, unit: "hour", unitCost: 65 },
    { name: "Waste disposal", category: "Disposal", quantity: 1, unit: "rental", unitCost: 525 },
  ],
}, { name: "Foreman Renovations", contactName: "Jordan Davis", phone: "604-555-0148", email: "quotes@example.com", address: "Vancouver, BC" });

await writeFile("tmp/quote-smoke.pdf", bytes);
}

void main();
