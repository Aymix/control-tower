export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export const ok = <T>(data?: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string): ActionResult<never> => ({ ok: false, error });

/** Wraps an action body: known errors become { ok: false }, redirects pass through. */
export async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const e = err as { message?: string; issues?: { message: string; path: (string | number)[] }[] };
    if (e?.issues?.length) return fail(e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    console.error(err);
    return fail(e?.message ?? "Something went wrong.");
  }
}

function isRedirectError(err: unknown) {
  return typeof (err as { digest?: string })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT");
}
