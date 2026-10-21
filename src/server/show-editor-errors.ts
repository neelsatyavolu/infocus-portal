/** User-facing refusal with a plain message (routes turn it into `fail(message, status)`). */
export class ShowEditError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
