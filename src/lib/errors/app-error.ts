export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE"
  | "INVITATION_INVALID"
  | "DATABASE"
  | "DELIVERY";

const publicMessages: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You do not have permission to perform this action.",
  INVALID_INPUT: "Some provided information is invalid.",
  NOT_FOUND: "The requested record was not found.",
  CONFLICT: "This operation conflicts with existing data.",
  INVALID_STATE: "This operation is not allowed in the current state.",
  INVITATION_INVALID: "The invitation is invalid, expired, or already used.",
  DATABASE: "The request could not be completed. Please try again.",
  DELIVERY: "The invitation was created, but delivery could not be completed.",
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly publicMessage: string;

  constructor(code: AppErrorCode, cause?: unknown) {
    super(publicMessages[code], cause === undefined ? undefined : { cause });
    this.name = "AppError";
    this.code = code;
    this.publicMessage = publicMessages[code];
  }
}

export function mapDatabaseError(error: {
  code?: string;
  message?: string;
}): AppError {
  switch (error.code) {
    case "42501":
      return new AppError("FORBIDDEN", error);
    case "22023":
      if (error.message?.includes("order status transition")) {
        return new AppError("INVALID_STATE", error);
      }
      return new AppError("INVALID_INPUT", error);
    case "22P02":
      return new AppError("INVALID_INPUT", error);
    case "P0002":
      return new AppError("NOT_FOUND", error);
    case "23505":
      return new AppError("CONFLICT", error);
    case "22000":
      return new AppError("INVITATION_INVALID", error);
    case "40001":
      return new AppError("INVALID_STATE", error);
    default:
      return new AppError("DATABASE", error);
  }
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.publicMessage;
  }
  return "The request could not be completed. Please try again.";
}
