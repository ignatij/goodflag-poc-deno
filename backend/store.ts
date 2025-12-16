export type SigningJobStatus = "pending" | "completed" | "error";

export interface SigningJob {
  id: string;
  fileName: string;
  fileType: string;
  status: SigningJobStatus;
  createdAt: number;
  updatedAt: number;
  workflowId?: string;
  workflowStatus?: string;
  signedDocument?: Uint8Array;
  signedFileName?: string;
  signedContentType?: string;
  errorMessage?: string;
}

const ONE_HOUR = 1000 * 60 * 60;

export class SigningStore {
  #jobs = new Map<string, SigningJob>();
  #ttlMs: number;

  constructor(ttlMs = ONE_HOUR) {
    this.#ttlMs = ttlMs;
    const timer = setInterval(() => this.#evictExpired(), this.#ttlMs);
    // Deno returns a number for setInterval, so unref is not available; ignore if missing.
    (timer as unknown as { unref?: () => void }).unref?.();
  }

  createJob(fileName: string, fileType: string): SigningJob {
    const id = crypto.randomUUID();
    const now = Date.now();
    const job: SigningJob = {
      id,
      fileName,
      fileType,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.#jobs.set(id, job);
    return job;
  }

  setWorkflow(id: string, workflowId: string, workflowStatus?: string) {
    const job = this.#jobs.get(id);
    if (!job) return;
    job.workflowId = workflowId;
    job.workflowStatus = workflowStatus;
    job.updatedAt = Date.now();
  }

  setWorkflowStatus(id: string, workflowStatus: string) {
    const job = this.#jobs.get(id);
    if (!job) return;
    job.workflowStatus = workflowStatus;
    job.updatedAt = Date.now();
  }

  completeJob(
    id: string,
    payload: { bytes: Uint8Array; fileName?: string; contentType?: string },
  ) {
    const job = this.#jobs.get(id);
    if (!job) return;
    job.status = "completed";
    job.updatedAt = Date.now();
    job.signedDocument = payload.bytes;
    job.signedFileName = payload.fileName ?? this.#defaultSignedName(job.fileName);
    job.signedContentType = payload.contentType ?? job.fileType;
  }

  failJob(id: string, errorMessage: string) {
    const job = this.#jobs.get(id);
    if (!job) return;
    job.status = "error";
    job.updatedAt = Date.now();
    job.errorMessage = errorMessage;
  }

  getJob(id: string): SigningJob | undefined {
    return this.#jobs.get(id);
  }

  #defaultSignedName(original: string) {
    const dotIdx = original.lastIndexOf(".");
    if (dotIdx === -1) return `${original}-signed.pdf`;
    const base = original.slice(0, dotIdx);
    const ext = original.slice(dotIdx);
    return `${base}-signed${ext}`;
  }

  #evictExpired() {
    const now = Date.now();
    for (const [id, job] of this.#jobs.entries()) {
      if (now - job.updatedAt > this.#ttlMs) {
        this.#jobs.delete(id);
      }
    }
  }
}

export const signingStore = new SigningStore();
