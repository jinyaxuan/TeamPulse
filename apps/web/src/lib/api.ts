/**
 * Shared helpers for API route handlers: JSON parsing with Zod, auth gate,
 * typed error responses.
 *
 * Importing this file also triggers the abandoned-task sweep loop (lazy
 * bootstrap). Any API route that uses `handler()` or `requireAuth()` keeps
 * the sweep alive.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, getAuthFromRequest, type AuthContext } from "./auth";
import "./sweep-bootstrap";

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function errorResponse(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("Invalid JSON body", 400);
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(`Validation failed: ${result.error.message}`, 400);
  }
  return result.data;
}

export async function requireAuth(request: Request): Promise<AuthContext> {
  const ctx = await getAuthFromRequest(request);
  if (!ctx) {
    throw new ApiError("Unauthorized", 401);
  }
  return ctx;
}

export async function requireAdminAuth(request: Request): Promise<AuthContext> {
  const ctx = await requireAuth(request);
  if (ctx.user.role !== "admin") {
    throw new ApiError("Admin access required", 403);
  }
  return ctx;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Wrap a route handler so thrown ApiError/AuthError become proper JSON errors
 * and unexpected throws become 500s with a generic message.
 */
export function handler<T = unknown>(
  fn: (request: Request, params: T) => Promise<Response>
): (request: Request, context: { params: Promise<T> }) => Promise<Response> {
  return async (request, context) => {
    try {
      const params = await context.params;
      return await fn(request, params);
    } catch (err) {
      if (err instanceof ApiError || err instanceof AuthError) {
        return errorResponse(err.message, err.status);
      }
      console.error("Unhandled route error:", err);
      return errorResponse("Internal server error", 500);
    }
  };
}
