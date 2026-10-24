export class TransportRuntimeError extends Error {
  readonly code: string;
  readonly currentRevision?: number | null;

  constructor(code: string, message: string, details?: { currentRevision?: number | null }) {
    super(message);
    this.code = code;
    this.currentRevision = details?.currentRevision;
  }
}
