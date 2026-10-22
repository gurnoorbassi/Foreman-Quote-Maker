/** Browser-side persistence only; authorization and atomicity belong to the API. */
export async function persistQuote(payload: Record<string, unknown>, request: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await request("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not confirm the save. Your edits are still open. Check your saved quotes before retrying.");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Could not confirm the save. Reload the quote list before retrying to avoid a duplicate.");
  }
  if (!response.ok) throw new Error(result?.error || "Could not save quote");
  if (typeof result?.id !== "string" || !result.id.trim()) {
    throw new Error("Could not confirm the save. Reload the quote list before retrying to avoid a duplicate.");
  }
  return result as { id: string; leadSync?: { status?: string; error?: string } };
}

/** Always save the current draft, including edits to a previously saved quote. */
export async function downloadSavedQuote(save: () => Promise<string | null>, navigate: (url: string) => void) {
  const id = await save();
  if (!id) throw new Error("The current quote was not saved. Resolve the save error and try downloading again.");
  navigate(`/api/pdf/${encodeURIComponent(id)}`);
}
