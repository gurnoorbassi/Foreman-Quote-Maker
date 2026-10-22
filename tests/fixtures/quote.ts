import type { QuoteInput } from "../../src/lib/quotes/save-quote.ts";

export const ownerId = "11111111-1111-4111-8111-111111111111";
export const otherOwnerId = "22222222-2222-4222-8222-222222222222";
export const quote: QuoteInput = {
  id: "33333333-3333-4333-8333-333333333333",
  quoteNumber: "Q-TEST-001",
  status: "DRAFT",
  customerName: "Synthetic customer",
  customerEmail: "customer@example.test",
  customerPhone: "",
  projectAddress: "Test address",
  projectType: "Renovation",
  projectTitle: "Original project",
  description: "Synthetic data only",
  scope: "Install cabinets",
  paymentTerms: "Due on completion",
  assumptions: "",
  exclusions: "",
  markup: 18,
  contingency: 5,
  tax: 5,
  deposit: 30,
  discount: 0,
  items: [
    { name: "Cabinets", category: "Materials", qty: 2, unit: "each", cost: 100 },
    { name: "Installation", category: "Labour", qty: 4, unit: "hour", cost: 50 },
  ],
};
