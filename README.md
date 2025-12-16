# Goodflag Deno Prototype

A minimal end-to-end prototype that accepts PDF uploads from the browser, submits them to Goodflag for signing via a Deno backend, and exposes a webhook endpoint to fetch the signed document once Goodflag finishes processing it.

## Project layout

```
backend/   Deno service that proxies uploads to Goodflag and stores signed PDFs in memory
frontend/  React + Vite single page app for uploading PDFs and polling signing status
```

## Prerequisites

- [Deno](https://deno.land/) 1.37+
- Node.js 18+ (for the frontend dev server)
- Goodflag Workflow Manager credentials (API key, owner user ID, signature profile, optional consent page)

## Backend setup

1. Copy `.env` and fill the Goodflag values:

   ```bash
   cp .env .env.local # optional backup
   export $(cat .env | xargs) # or use direnv
   ```

   | Variable | Description |
   | --- | --- |
   | `GOODFLAG_BASE_URL` | Workflow Manager base URL, e.g. `https://workflow-manager/api/` |
   | `GOODFLAG_API_KEY` | API key/token for Workflow Manager requests |
   | `GOODFLAG_USER_ID` | Goodflag user ID that owns the workflow (`usr_...`) |
   | `GOODFLAG_SIGNATURE_PROFILE_ID` | Signature profile applied when uploading documents (`sip_...`) |
   | `GOODFLAG_CONSENT_PAGE_ID` | *(Optional)* default consent page ID for recipients (`cop_...`) |
   | `GOODFLAG_DEFAULT_LOCALE` | *(Optional)* default recipient locale (defaults to `en`) |
   | `SIGNATURE_FIELD_PAGE` | *(Optional)* page for the default signature field (`-1` = last page) |
   | `SIGNATURE_FIELD_X` | *(Optional)* X coordinate (pixels) for the default signature field |
   | `SIGNATURE_FIELD_Y` | *(Optional)* Y coordinate (pixels) for the default signature field |
   | `SIGNATURE_FIELD_WIDTH` | *(Optional)* Width (pixels) of the default signature field |
   | `SIGNATURE_FIELD_HEIGHT` | *(Optional)* Height (pixels) of the default signature field |
   | `FRONTEND_ORIGIN` | Origin allowed to call the API in dev (defaults to `*`) |
   | `PORT` | Port for the Deno service (default `8000`) |

2. Run the API (Deno will need network access to download dependencies the first time):

   ```bash
   deno task dev
   ```

   Endpoints:
   - `POST /api/sign` – accepts a multipart/form-data request with `file`, `signer_email`, and optional signer/workflow metadata; creates a Goodflag workflow, uploads the document, drops a default signature box in the top-right corner, and starts the workflow.
   - `GET /api/sign/:jobId` – returns the job plus the latest Goodflag workflow status; each call refreshes the workflow and, once finished, downloads the signed document.
   - `GET /api/sign/:jobId/file` – download the signed PDF/ZIP once the workflow is finished

> ℹ️ This prototype holds signed PDFs in memory for roughly one hour; switch to durable storage before production.

## Frontend setup

1. Install dependencies inside `frontend/`:

   ```bash
   cd frontend
   npm install
   ```

2. Start the dev server (proxying `/api` calls to `localhost:8000`):

   ```bash
   npm run dev
   ```

3. Open `http://localhost:5173` and upload a PDF. Provide the signer’s email plus any required identity fields (name, etc.) and submit; the UI polls the backend until Goodflag reports the workflow as finished, then exposes a download link. A default signature field is placed at the top-right of the last PDF page automatically—adjust by editing `DEFAULT_FIELD` in `backend/goodflag.ts`.

To build a static bundle:

```bash
npm run build && npm run preview
```

## Workflow status polling

This prototype uses polling rather than Goodflag webhooks: each call to `GET /api/sign/:jobId` looks up the workflow, updates its status, and downloads the signed documents automatically. In production you can complement this with Goodflag webhooks to react instantly and reduce API load.

## Next steps

- Replace the in-memory store with S3, Supabase, etc.
- Add authentication to the upload endpoint.
- Persist metadata (signer info, audit log) alongside the job state.
