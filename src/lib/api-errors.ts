import { fail } from "@/src/lib/http";

export function handleRouteError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return fail("Unauthorized", 401);
    }

    if (error.message === "FORBIDDEN") {
      return fail("Forbidden", 403);
    }

    if (error.message === "NOT_FOUND") {
      return fail("Not found", 404);
    }

    if (error.message === "BAD_REQUEST") {
      return fail("Bad request", 400);
    }

    if (error.message === "CONFLICT") {
      return fail("Conflict", 409);
    }

    if (error.message === "TOO_MANY_REQUESTS") {
      return fail("Rate limit exceeded", 429);
    }

    return fail(error.message, 400);
  }

  return fail("Unexpected server error", 500);
}
