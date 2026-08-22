import type { ToolClassification } from "../audit.js";

export class AuthorizationRequiredError extends Error {
  readonly code = "authorization_required";
  readonly classification?: ToolClassification;

  constructor(
    public readonly elicit: {
      message: string;
      requestedSchema: Record<string, unknown>;
      requestState: string;
    },
    classification?: ToolClassification
  ) {
    super("Human confirmation is required before this action can execute");
    this.name = "AuthorizationRequiredError";
    this.classification = classification;
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
