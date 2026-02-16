export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class PayloadBase64DecodeError extends PayloadError {}
export class PayloadGzipDecodeError extends PayloadError {}
export class PayloadJsonParseError extends PayloadError {}
export class PayloadValidationError extends PayloadError {}
export class PayloadSizeError extends PayloadError {}
