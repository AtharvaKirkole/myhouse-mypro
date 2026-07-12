/*
 * Typed error hierarchy. Every throw in the codebase is one of these; the
 * gateway error handler maps them to a consistent envelope:
 *   { error, message, details?, requestId }
 * Stack traces never leave the process.
 */

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown
  ) {
    super(message ?? code);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = "Request failed validation") {
    super(400, "validation_error", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = "unauthenticated", message?: string) {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(code = "forbidden", message?: string) {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(code = "not_found", message?: string) {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(code = "conflict", message?: string) {
    super(409, code, message);
  }
}

export class RateLimitError extends AppError {
  constructor(code = "rate_limited", message?: string) {
    super(429, code, message);
  }
}

export class PaymentError extends AppError {
  constructor(code = "payment_error", message?: string) {
    super(402, code, message);
  }
}

export class AIError extends AppError {
  constructor(code = "ai_error", message?: string) {
    super(502, code, message);
  }
}

export class DatabaseError extends AppError {
  constructor(message?: string) {
    super(500, "database_error", message);
  }
}

/* Back-compat constructor used across services: HttpError(status, code, msg) */
export class HttpError extends AppError {}
