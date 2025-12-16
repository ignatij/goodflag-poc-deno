import config from "./config.ts";

export interface WorkflowRecipientInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  preferredLocale?: string;
  comments?: string;
  consentPageId?: string;
  organizationId?: string;
  country?: string;
}

export interface CreateWorkflowOptions {
  name: string;
  signer: WorkflowRecipientInput;
}

export interface GoodflagWorkflow {
  id: string;
  workflowStatus?: string;
  name?: string;
  created?: number;
  updated?: number;
}

export interface DownloadResult {
  bytes: Uint8Array;
  fileName?: string;
  contentType: string;
}

function buildUrl(path: string): string {
  const base = config.goodflagBaseUrl.endsWith("/")
    ? config.goodflagBaseUrl
    : `${config.goodflagBaseUrl}/`;
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalized, base).toString();
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  return {
    Authorization: `Bearer ${config.goodflagApiKey}`,
    ...(extra ?? {}),
  };
}

function sanitizeRecipient(recipient: WorkflowRecipientInput) {
  const payload: Record<string, string> = {
    email: recipient.email,
  };
  const optionalKeys: Array<keyof WorkflowRecipientInput> = [
    "firstName",
    "lastName",
    "phoneNumber",
    "preferredLocale",
    "comments",
    "consentPageId",
    "organizationId",
    "country",
  ];
  for (const key of optionalKeys) {
    const value = recipient[key];
    if (value) {
      payload[key] = value;
    }
  }
  return payload;
}

export async function createWorkflow(
  options: CreateWorkflowOptions,
): Promise<GoodflagWorkflow> {
  const signer = sanitizeRecipient({
    preferredLocale: config.defaultLocale,
    ...options.signer,
  });
  if (config.goodflagConsentPageId && !signer.consentPageId) {
    signer.consentPageId = config.goodflagConsentPageId;
  }

  const url = buildUrl(`/users/${config.goodflagUserId}/workflows`);
  const body = {
    name: options.name,
    steps: [
      {
        stepType: "signature",
        recipients: [signer],
        maxInvites: 1,
      },
    ],
  };

  console.debug("createWorkflow payload", JSON.stringify(body, null, 2));
  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response
      .text()
      .catch(() => "Unable to read error response");
    throw new Error(
      `Goodflag workflow creation failed (${response.status}): ${errorText}`,
    );
  }

  return (await response.json()) as GoodflagWorkflow;
}

export interface UploadWorkflowDocumentResult {
  documentId?: string;
}

export async function uploadWorkflowDocument(
  workflowId: string,
  file: File,
): Promise<UploadWorkflowDocumentResult> {
  const url = new URL(buildUrl(`/workflows/${workflowId}/parts`));
  url.searchParams.set("createDocuments", "true");
  url.searchParams.set("signatureProfileId", config.goodflagSignatureProfileId);

  const body = new FormData();
  body.set("document", file, file.name || "document.pdf");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: authHeaders(),
    body,
  });

  if (!response.ok) {
    const errorText = await response
      .text()
      .catch(() => "Unable to read error response");
    throw new Error(
      `Goodflag document upload failed (${response.status}): ${errorText}`,
    );
  }

  let documentId: string | undefined;
  try {
    const payload = await response.clone().json();
    documentId = payload?.documents?.[0]?.id ?? payload?.id;
  } catch (_err) {
    // ignore parse errors and continue without document id
  }

  return { documentId };
}

export async function applyDefaultSignatureField(
  documentId: string,
): Promise<void> {
  const url = buildUrl(`/documents/${documentId}`);
  const field = {
    imagePage: config.signatureField.page,
    imageX: config.signatureField.x,
    imageY: config.signatureField.y,
    imageWidth: config.signatureField.width,
    imageHeight: config.signatureField.height,
  };
  const response = await fetch(url, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      signatureProfileId: config.goodflagSignatureProfileId,
      pdfSignatureFields: [field],
    }),
  });

  if (!response.ok) {
    const errorText = await response
      .text()
      .catch(() => "Unable to read error response");
    throw new Error(
      `Goodflag signature field placement failed (${response.status}): ${errorText}`,
    );
  }
}

export async function startWorkflow(
  workflowId: string,
): Promise<GoodflagWorkflow> {
  const url = buildUrl(`/workflows/${workflowId}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ workflowStatus: "started" }),
  });

  if (!response.ok) {
    const errorText = await response
      .text()
      .catch(() => "Unable to read error response");
    throw new Error(
      `Goodflag workflow start failed (${response.status}): ${errorText}`,
    );
  }

  return (await response.json()) as GoodflagWorkflow;
}

export async function fetchWorkflow(
  workflowId: string,
): Promise<GoodflagWorkflow> {
  const url = buildUrl(`/workflows/${workflowId}`);
  const response = await fetch(url, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const errorText = await response
      .text()
      .catch(() => "Unable to read error response");
    throw new Error(
      `Goodflag workflow fetch failed (${response.status}): ${errorText}`,
    );
  }
  return (await response.json()) as GoodflagWorkflow;
}

export async function downloadWorkflowDocuments(
  workflowId: string,
): Promise<DownloadResult> {
  const url = buildUrl(`/workflows/${workflowId}/downloadDocuments`);
  const response = await fetch(url, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    const errorText = await response
      .text()
      .catch(() => "Unable to read error response");
    throw new Error(
      `Goodflag signed document download failed (${response.status}): ${errorText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const contentType = response.headers.get("content-type") ?? "application/pdf";
  const fileName = parseFileName(response.headers.get("content-disposition"));

  return { bytes, contentType, fileName };
}

function parseFileName(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const match = disposition.match(
    /filename\*=UTF-8''([^;]+)|filename="?([^;"]+)"?/i,
  );
  if (!match) return undefined;
  const encoded = match[1] ?? match[2];
  try {
    return decodeURIComponent(encoded);
  } catch (_err) {
    return encoded;
  }
}
