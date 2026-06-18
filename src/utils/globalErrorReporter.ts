type ErrorReporter = (error: unknown) => void;

let reporter: ErrorReporter | null = null;

export function setGlobalErrorReporter(next: ErrorReporter | null): void {
  reporter = next;
}

export function reportGlobalError(error: unknown): void {
  reporter?.(error);
}
