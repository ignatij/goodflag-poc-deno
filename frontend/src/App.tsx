import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

interface SigningStatus {
  jobId: string;
  status: string;
  fileName?: string;
  signedFileName?: string | null;
  downloadUrl?: string | null;
  error?: string | null;
  workflowId?: string | null;
  workflowStatus?: string | null;
  updatedAt?: number;
}

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${apiBase}${path}`;
const POLL_INTERVAL_MS = 2500;

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerFirstName, setSignerFirstName] = useState("");
  const [signerLastName, setSignerLastName] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [status, setStatus] = useState<SigningStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isReady = useMemo(
    () => Boolean(file) && signerEmail.trim().length > 0,
    [file, signerEmail],
  );

  useEffect(() => {
    if (!status || status.status === "completed" || status.status === "error") {
      return;
    }
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/sign/${status.jobId}`));
        if (!res.ok) {
          throw new Error(`Unable to fetch status (${res.status})`);
        }
        const payload = (await res.json()) as SigningStatus;
        setStatus(payload);
      } catch (err) {
        console.error(err);
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [status?.jobId, status?.status]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!file || !signerEmail.trim()) {
        setMessage("Please choose a PDF and provide a signer email.");
        return;
      }
      setIsSubmitting(true);
      setMessage(null);
      try {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("signer_email", signerEmail.trim());
        if (signerFirstName) {
          formData.set("signer_first_name", signerFirstName);
        }
        if (signerLastName) {
          formData.set("signer_last_name", signerLastName);
        }
        if (workflowName) {
          formData.set("workflow_name", workflowName);
        }
        const trimmedPhone = signerPhone.trim();
        if (trimmedPhone) {
          formData.set("signer_phone", trimmedPhone);
        }
        const response = await fetch(apiUrl("/api/sign"), {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const error = await response
            .json()
            .catch(() => ({ error: "Upload failed" }));
          throw new Error(error.error || "Upload failed");
        }
        const payload = (await response.json()) as SigningStatus;
        setStatus(payload);
        setMessage("Workflow created in Goodflag. Waiting for completion...");
      } catch (err) {
        const description =
          err instanceof Error ? err.message : "Unexpected error";
        setMessage(description);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      file,
      signerEmail,
      signerFirstName,
      signerLastName,
      signerPhone,
      workflowName,
    ],
  );

  const downloadHref = useMemo(() => {
    if (!status?.downloadUrl) return null;
    return apiUrl(status.downloadUrl);
  }, [status?.downloadUrl]);

  return (
    <main className="app-shell">
      <section className="panel">
        <h1>Goodflag PDF Signer</h1>
        <p className="muted">
          Upload a PDF, forward it to Goodflag for signing, and download the
          signed document when it's ready.
        </p>
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>PDF Document</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>
          <label className="field">
            <span>Workflow Name (optional)</span>
            <input
              type="text"
              value={workflowName}
              placeholder="Q1 Contract Approval"
              onChange={(event) => setWorkflowName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Signer Email</span>
            <input
              type="email"
              value={signerEmail}
              placeholder="jamal.towne@example.com"
              onChange={(event) => setSignerEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Signer First Name (optional)</span>
            <input
              type="text"
              value={signerFirstName}
              placeholder="Jamal"
              onChange={(event) => setSignerFirstName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Signer Last Name (optional)</span>
            <input
              type="text"
              value={signerLastName}
              placeholder="Towne"
              onChange={(event) => setSignerLastName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Signer Phone Number (optional)</span>
            <input
              type="tel"
              value={signerPhone}
              placeholder="+33 6 12 34 56 78"
              onChange={(event) => setSignerPhone(event.target.value)}
            />
          </label>
          <button
            className="primary"
            type="submit"
            disabled={!isReady || isSubmitting}
          >
            {isSubmitting ? "Submitting…" : "Send to Goodflag"}
          </button>
        </form>
        {message && <p className="message">{message}</p>}
      </section>

      {status && (
        <section className="panel status-panel">
          <h2>Signing Status</h2>
          <dl>
            <div>
              <dt>Job ID</dt>
              <dd>{status.jobId}</dd>
            </div>
            <div>
              <dt>Current State</dt>
              <dd className={`status ${status.status}`}>{status.status}</dd>
            </div>
            {status.workflowStatus && (
              <div>
                <dt>Workflow Status</dt>
                <dd>{status.workflowStatus}</dd>
              </div>
            )}
            {status.workflowId && (
              <div>
                <dt>Workflow ID</dt>
                <dd>{status.workflowId}</dd>
              </div>
            )}
            {status.fileName && (
              <div>
                <dt>Original File</dt>
                <dd>{status.fileName}</dd>
              </div>
            )}
            {status.error && (
              <div>
                <dt>Error</dt>
                <dd className="error">{status.error}</dd>
              </div>
            )}
            {status.updatedAt && (
              <div>
                <dt>Last Update</dt>
                <dd>{new Date(status.updatedAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>

          {status.status === "completed" && downloadHref && (
            <a
              className="primary"
              href={downloadHref}
              target="_blank"
              rel="noreferrer"
            >
              Download Signed PDF
            </a>
          )}
        </section>
      )}
    </main>
  );
}
