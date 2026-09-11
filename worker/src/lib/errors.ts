export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);
export const validationError = (message: string, details?: unknown) =>
  new AppError(422, 'validation_error', message, details);
export const unauthorized = () => new AppError(401, 'unauthorized', 'You must be signed in.');
export const forbidden = (message = 'You do not have permission to do this.') =>
  new AppError(403, 'forbidden', message);
export const notFound = (message = 'Not found.') => new AppError(404, 'not_found', message);
export const conflict = (message: string) => new AppError(409, 'conflict', message);
export const rateLimited = (retryAfter: number) =>
  new AppError(429, 'rate_limited', `Too many requests. Try again in ${retryAfter}s.`);
export const quotaExceeded = (message: string, details?: unknown) =>
  new AppError(403, 'quota_exceeded', message, details);

export function errorMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof Error) return 'Something went wrong. Please try again.';
  return 'Something went wrong. Please try again.';
}
