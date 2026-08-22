export class AuthorizationRequiredError extends Error {
  readonly code = "authorization_required";

  constructor(
    public readonly elicit: {
      message: string;
      requestedSchema: Record<string, unknown>;
      requestState: string;
    }
  ) {
    super("Human confirmation is required before this action can execute");
    this.name = "AuthorizationRequiredError";
  }
}

export class WriteValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "WriteValidationError";
  }
}
