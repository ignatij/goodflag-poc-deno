import config from "./config.ts";
import {
  applyDefaultSignatureField,
  createWorkflow,
  downloadWorkflowDocuments,
  fetchWorkflow,
  startWorkflow,
  uploadWorkflowDocument,
} from "./goodflag.ts";
import { signingStore } from "./store.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": config.frontendOrigin,
  "Access-Control-Allow-Headers": "Content-Type, X-Goodflag-Signature",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const base = init ?? {};
  const headers = new Headers(base.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(JSON.stringify(data), { ...base, headers });
}

function getTextValue(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function handleSign(req: Request): Promise<Response> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonResponse(
      { error: "Request must be multipart/form-data" },
      { status: 400 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonResponse({ error: "File field is required" }, { status: 400 });
  }

  if (
    file.type &&
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    return jsonResponse(
      { error: "Only PDF files are supported" },
      { status: 400 },
    );
  }

  const signerEmail = getTextValue(formData.get("signer_email"));
  if (!signerEmail) {
    return jsonResponse({ error: "Signer email is required" }, { status: 400 });
  }

  const signerInfo = {
    email: signerEmail,
    firstName: getTextValue(formData.get("signer_first_name")),
    lastName: getTextValue(formData.get("signer_last_name")),
    preferredLocale: getTextValue(formData.get("signer_locale")),
    comments: getTextValue(formData.get("signer_comments")),
    consentPageId: getTextValue(formData.get("signer_consent_page_id")),
    userId: getTextValue(formData.get("signer_user_id")),
  };

  const workflowName = getTextValue(formData.get("workflow_name")) ||
    file.name ||
    "Document signature workflow";

  const job = signingStore.createJob(
    file.name || "document.pdf",
    file.type || "application/pdf",
  );

  try {
    const workflow = await createWorkflow({
      name: workflowName,
      signer: signerInfo,
    });
    signingStore.setWorkflow(job.id, workflow.id, workflow.workflowStatus);
    const uploadResult = await uploadWorkflowDocument(workflow.id, file);
    if (uploadResult.documentId) {
      try {
        await applyDefaultSignatureField(uploadResult.documentId);
      } catch (signatureError) {
        console.warn(
          `Unable to place default signature field on document ${uploadResult.documentId}`,
          signatureError,
        );
      }
    }
    const startedWorkflow = await startWorkflow(workflow.id);
    if (startedWorkflow.workflowStatus) {
      signingStore.setWorkflowStatus(job.id, startedWorkflow.workflowStatus);
    }
    return jsonResponse({
      jobId: job.id,
      status: job.status,
      workflowId: workflow.id,
      workflowStatus: startedWorkflow.workflowStatus ?? workflow.workflowStatus ?? "started",
      fileName: job.fileName,
    });
  } catch (error) {
    console.error("Failed to initialize Goodflag workflow", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    signingStore.failJob(job.id, message);
    return jsonResponse(
      { error: "Failed to create Goodflag workflow" },
      { status: 502 },
    );
  }
}

async function handleGetStatus(jobId: string): Promise<Response> {
  let job = signingStore.getJob(jobId);
  if (!job) {
    return jsonResponse({ error: "Signing job not found" }, { status: 404 });
  }

  if (job.status === "pending" && job.workflowId) {
    try {
      const workflow = await fetchWorkflow(job.workflowId);
      if (workflow.workflowStatus) {
        signingStore.setWorkflowStatus(job.id, workflow.workflowStatus);
        job = signingStore.getJob(jobId)!;
      }
      const normalizedStatus = workflow.workflowStatus?.toLowerCase();
      if (normalizedStatus === "finished") {
        const signed = await downloadWorkflowDocuments(job.workflowId!);
        signingStore.completeJob(job.id, {
          bytes: signed.bytes,
          fileName: signed.fileName,
          contentType: signed.contentType,
        });
        job = signingStore.getJob(jobId)!;
      } else if (
        normalizedStatus &&
        ["stopped", "refused", "canceled", "failed"].includes(normalizedStatus)
      ) {
        signingStore.failJob(job.id, `Workflow ${workflow.workflowStatus}`);
        job = signingStore.getJob(jobId)!;
      }
    } catch (error) {
      console.error("Failed to refresh Goodflag workflow", error);
    }
  }

  return jsonResponse({
    jobId: job.id,
    status: job.status,
    updatedAt: job.updatedAt,
    fileName: job.fileName,
    signedFileName: job.signedFileName ?? null,
    workflowId: job.workflowId ?? null,
    workflowStatus: job.workflowStatus ?? null,
    error: job.errorMessage ?? null,
    downloadUrl: job.status === "completed" ? `/api/sign/${job.id}/file` : null,
  });
}

function handleDownload(jobId: string): Response {
  const job = signingStore.getJob(jobId);
  if (!job) {
    return jsonResponse({ error: "Signing job not found" }, { status: 404 });
  }
  if (job.status !== "completed" || !job.signedDocument) {
    return jsonResponse(
      { error: "Signed document is not available yet" },
      { status: 409 },
    );
  }
  const signedBytes = job.signedDocument;
  if (!signedBytes) {
    return jsonResponse(
      { error: "Signed document is not available yet" },
      { status: 409 },
    );
  }

  const headers = new Headers({
    "Content-Type": job.signedContentType || job.fileType || "application/pdf",
    "Content-Disposition": `attachment; filename="${job.signedFileName ?? job.fileName}"`,
    ...corsHeaders,
  });

  return new Response(signedBytes as unknown as BodyInit, {
    status: 200,
    headers,
  });
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }));
  }

  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/healthz") {
    return jsonResponse({ ok: true, uptime: performance.now() });
  }

  if (req.method === "POST" && url.pathname === "/api/sign") {
    return await handleSign(req);
  }

  if (url.pathname.startsWith("/api/sign/")) {
    // url.pathname looks like /api/sign/:id or /api/sign/:id/file
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 3 && req.method === "GET") {
      const jobId = parts[2];
      return await handleGetStatus(jobId);
    }
    if (parts.length === 4 && parts[3] === "file" && req.method === "GET") {
      const jobId = parts[2];
      return handleDownload(jobId);
    }
  }

  return jsonResponse({ error: "Not found" }, { status: 404 });
}

console.log(`Starting Goodflag prototype API on port ${config.port}`);

Deno.serve({ port: config.port }, (req: Request) =>
  handler(req).catch((error) => {
    console.error("Unhandled server error", error);
    return jsonResponse({ error: "Internal server error" }, { status: 500 });
  }));
