import type { FieldValues, Resolver, ResolverResult } from "react-hook-form";
import type { z } from "zod";

/**
 * Custom `react-hook-form` resolver for Zod v4 schemas.
 *
 * `@hookform/resolvers@3` ships an adapter that calls `schema.parse(values)`
 * and catches `ZodError` — but the error shape changed in Zod v4 (issues now
 * include `format`, `origin`, `code: "invalid_format"`, etc.) and the v3
 * adapter's instanceof check no longer recognises it. The result: every
 * field-level failure leaks as a runtime ZodError instead of flowing into
 * `formState.errors`.
 *
 * This resolver uses `safeParse`, which never throws — we just translate
 * its `success: false` path into RHF's `FieldErrors` map. Works identically
 * for Zod v3 and v4.
 */
// Typed loosely on purpose. `Resolver` is contravariant in `TFieldValues`,
// so a `Resolver<FieldValues>` can't be assigned where a `Resolver<Concrete>`
// is expected. The form's `useForm<TValues>()` carries the concrete types
// anyway, so we don't lose any safety at the call site.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodResolverSafe<TValues extends FieldValues = any>(
  schema: z.ZodTypeAny,
): Resolver<TValues> {
  return async (values): Promise<ResolverResult<TValues>> => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { values: result.data as TValues, errors: {} };
    }
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      // For nested paths (e.g. `rubric.0.label`) we join with dot — RHF
      // resolves it back to the right nested error slot when reading
      // formState.errors. For empty path, key under "root".
      const key = issue.path.length === 0 ? "root" : issue.path.join(".");
      if (!errors[key]) {
        errors[key] = {
          type: issue.code ?? "validation",
          message: issue.message,
        };
      }
    }
    return {
      values: {} as Record<string, never>,
      errors: errors as ResolverResult<TValues>["errors"],
    };
  };
}
