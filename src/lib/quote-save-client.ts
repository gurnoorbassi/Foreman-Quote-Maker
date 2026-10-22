type SavePayload = { id: string; [key: string]: unknown };
type SaveResult = { id: string; saved: true; leadSync?: { status: string; error?: string } };

const unconfirmedSave = "The save could not be confirmed. Your edits are still here; try saving again.";

export function createQuoteIdentity() {
  const id = crypto.randomUUID();
  return {
    id,
    quoteNumber: `Q-${new Date().getFullYear()}-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
  };
}

/** A lost response can follow a committed save. Retrying must keep payload.id. */
export async function saveQuoteRequest(payload: SavePayload, request: typeof fetch = fetch): Promise<SaveResult> {
  let response: Response;
  try {
    response = await request("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(unconfirmedSave);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(unconfirmedSave);
  }

  if (!response.ok) {
    const error = result && typeof result === "object" && "error" in result ? result.error : null;
    throw new Error(typeof error === "string" ? error : "Could not save quote. Your edits are still here.");
  }
  if (!result || typeof result !== "object" || !("id" in result) || result.id !== payload.id || !("saved" in result) || result.saved !== true) {
    throw new Error(unconfirmedSave);
  }

  const saved: SaveResult = { id: payload.id, saved: true };
  if ("leadSync" in result && result.leadSync && typeof result.leadSync === "object" && "status" in result.leadSync && typeof result.leadSync.status === "string") {
    saved.leadSync = { status: result.leadSync.status };
    if ("error" in result.leadSync && typeof result.leadSync.error === "string") saved.leadSync.error = result.leadSync.error;
  }
  return saved;
}
