export type DomainErrorCode =
  | "attempt_not_found"
  | "attempt_locked"
  | "attempt_already_submitted";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly statusCode: number;

  constructor(code: DomainErrorCode, statusCode: number, message?: string) {
    super(message ?? code);
    this.name = "DomainError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const AttemptNotFound = () => new DomainError("attempt_not_found", 404);
export const AttemptLocked = () => new DomainError("attempt_locked", 409);
export const AttemptAlreadySubmitted = () =>
  new DomainError("attempt_already_submitted", 409);
