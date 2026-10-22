import { z } from "zod";

// Match numeric(12,2) storage bounds before any database mutation.
export const quoteSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  quoteNumber: z.string().trim().min(1).max(80),
  status: z.enum(["DRAFT", "READY", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]).default("DRAFT"),
  customerName: z.string().trim().min(1).max(160),
  customerEmail: z.string().email().or(z.literal("")),
  customerPhone: z.string().max(60),
  projectAddress: z.string().max(300),
  projectType: z.string().min(1).max(100),
  projectTitle: z.string().min(1).max(200),
  description: z.string().max(6000),
  scope: z.string().max(12000),
  paymentTerms: z.string().max(6000),
  assumptions: z.string().max(6000),
  exclusions: z.string().max(6000),
  markup: z.number().min(0).max(100),
  contingency: z.number().min(0).max(100),
  tax: z.number().min(0).max(100),
  deposit: z.number().min(0).max(100),
  discount: z.number().min(0).max(9_999_999_999.99),
  items: z.array(z.object({ name: z.string().min(1).max(200), category: z.string().min(1).max(100), qty: z.number().min(0).max(9_999_999_999.99), unit: z.string().min(1).max(50), cost: z.number().min(0).max(9_999_999_999.99) })).min(1).max(250),
});
