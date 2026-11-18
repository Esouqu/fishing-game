/**
 * Getting a tuned zone out of the browser and back into the code.
 *
 * A dev server cannot be written to from a normal build, so there is one path
 * and it is honest about it: `writeZoneTuning` POSTs the generated block to the
 * Vite middleware configured in `vite.config.ts`, which swaps the region between
 * the `zone-mix` markers inside `zoneTuning.ts`. The page reloads on the file
 * change, and the tuned set is now the shipped default.
 *
 * There is no clipboard or download fallback: the block is only half the file,
 * and pasting it by hand is what the markers are there to make unnecessary.
 */
export async function writeZoneTuning(block: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}__fishing/zone-mix`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ block }),
      },
    );
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return (
      typeof body === "object" &&
      body !== null &&
      (body as { ok?: unknown }).ok === true
    );
  } catch {
    return false;
  }
}
