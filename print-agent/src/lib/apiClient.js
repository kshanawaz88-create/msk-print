"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

class ApiError extends Error {
  constructor(
    message,
    {
      status = 0,
      code = "API_ERROR",
      details = null,
      cause,
    } = {}
  ) {
    super(message, { cause });

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;

    this.retriable =
      status === 0 ||
      status === 408 ||
      status === 429 ||
      status >= 500;
  }
}

class ApiClient {
  constructor({
    baseUrl = "http://localhost:5000",
    getToken = async () => null,
    fetchImpl = globalThis.fetch,
    onUnauthorized = async () => {},
    timeoutMs = 20_000,
    maxDownloadBytes = 25 * 1024 * 1024,
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new Error(
        "A Fetch-compatible implementation is required."
      );
    }

    this.baseUrl = validateBaseUrl(baseUrl);
    this.getToken = getToken;
    this.fetch = fetchImpl;
    this.onUnauthorized = onUnauthorized;
    this.timeoutMs = timeoutMs;
    this.maxDownloadBytes = maxDownloadBytes;
  }

  setBaseUrl(baseUrl) {
    this.baseUrl = validateBaseUrl(baseUrl);
  }

  // ==========================================
  // Agent Authentication
  // ==========================================

  async login({ email, password }) {
    return this._request("/api/agent/login", {
      method: "POST",
      authenticated: false,
      body: {
        email,
        password,
      },
    });
  }

  // ==========================================
  // Queue
  // ==========================================

  async getQueue() {
    return this._request("/api/print/queue");
  }

  async getHistory() {
    return this._request("/api/print/queue/history");
  }

  async claim(printJobId, claimToken) {
    return this._request("/api/print/queue/claim", {
      method: "POST",
      body: {
        printJobId,
        claimToken,
      },
    });
  }

  async reprint(printJobId, claimToken) {
    return this._request(
      `/api/print/queue/${encodeURIComponent(
        printJobId
      )}/reprint`,
      {
        method: "POST",
        body: {
          claimToken,
        },
      }
    );
  }

  async markStarted(
    printJobId,
    claimToken,
    printerName
  ) {
    return this._claimedRequest(
      printJobId,
      "started",
      claimToken,
      {
        printerName,
      }
    );
  }

  async markComplete(
    printJobId,
    claimToken,
    printerName
  ) {
    return this._claimedRequest(
      printJobId,
      "complete",
      claimToken,
      {
        printerName,
      }
    );
  }

  async markError(
    printJobId,
    claimToken,
    errorReason,
    printerName
  ) {
    return this._claimedRequest(
      printJobId,
      "error",
      claimToken,
      {
        errorReason,
        printerName,
      }
    );
  }

  async cancel(
    printJobId,
    claimToken,
    errorReason = "Cancelled by print agent"
  ) {
    return this._claimedRequest(
      printJobId,
      "cancel",
      claimToken,
      {
        errorReason,
      }
    );
  }

  // ==========================================
  // File Download
  // ==========================================

  async downloadFile(
    printJobId,
    claimToken,
    destinationPath
  ) {
    if (!destinationPath) {
      throw new Error(
        "A local download destination is required."
      );
    }

    const response = await this._fetch(
      `/api/print/queue/${encodeURIComponent(
        printJobId
      )}/file`,
      {
        headers: {
          "X-Print-Claim": claimToken,
        },
      }
    );

    if (!response.ok) {
      throw await this._responseError(response);
    }

    const declaredLength = Number(
      response.headers.get("content-length") || 0
    );

    if (declaredLength > this.maxDownloadBytes) {
      throw new ApiError(
        "The print file exceeds the local download limit.",
        {
          status: 413,
          code: "FILE_TOO_LARGE",
        }
      );
    }

    const buffer = Buffer.from(
      await response.arrayBuffer()
    );

    if (buffer.length > this.maxDownloadBytes) {
      throw new ApiError(
        "The print file exceeds the local download limit.",
        {
          status: 413,
          code: "FILE_TOO_LARGE",
        }
      );
    }

    const detectedType =
      detectPrintFileType(buffer);

    if (!detectedType) {
      throw new ApiError(
        "The server response is not a supported PDF, JPG, or PNG file.",
        {
          status: 422,
          code: "UNSUPPORTED_PRINT_FILE",
        }
      );
    }

    await fs.mkdir(path.dirname(destinationPath), {
      recursive: true,
    });

    const partialPath =
      `${destinationPath}.${process.pid}.part`;

    try {
      await fs.writeFile(
        partialPath,
        buffer,
        {
          mode: 0o600,
        }
      );

      await fs.rename(
        partialPath,
        destinationPath
      );
    } catch (error) {
      await fs
        .rm(partialPath, { force: true })
        .catch(() => {});

      throw error;
    }

    return {
      path: destinationPath,

      filename: getDownloadFilename(
        response.headers.get(
          "content-disposition"
        )
      ),

      contentType: detectedType,
      bytes: buffer.length,
    };
  }

  // ==========================================
  // Internal Requests
  // ==========================================

  _claimedRequest(
    printJobId,
    action,
    claimToken,
    body
  ) {
    return this._request(
      `/api/print/queue/${encodeURIComponent(
        printJobId
      )}/${action}`,
      {
        method: "POST",

        headers: {
          "X-Print-Claim": claimToken,
        },

        body: {
          ...body,
          claimToken,
        },
      }
    );
  }

  async _request(
    relativeUrl,
    options = {}
  ) {
    const headers = {
      Accept: "application/json",
      ...(options.headers || {}),
    };

    if (options.body !== undefined) {
      headers["Content-Type"] =
        "application/json";
    }

    const response = await this._fetch(
      relativeUrl,
      {
        ...options,
        headers,

        body:
          options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
      }
    );

    if (!response.ok) {
      throw await this._responseError(
        response
      );
    }

    if (response.status === 204) {
      return null;
    }

    try {
      return await response.json();
    } catch (error) {
      throw new ApiError(
        "The server returned an invalid JSON response.",
        {
          status: response.status,
          code: "INVALID_RESPONSE",
          cause: error,
        }
      );
    }
  }

  async _fetch(
    relativeUrl,
    options = {}
  ) {
    const controller =
      new AbortController();

    const timeoutId = setTimeout(
      () => controller.abort(),
      this.timeoutMs
    );

    try {
      const headers = {
        ...(options.headers || {}),
      };

      if (options.authenticated !== false) {
        const token = await this.getToken();

        if (!token) {
          throw new ApiError(
            "The print agent is not logged in.",
            {
              status: 401,
              code: "NOT_AUTHENTICATED",
            }
          );
        }

        headers.Authorization =
          `Bearer ${token}`;
      }

      const url = new URL(
        relativeUrl,
        this.baseUrl
      );

      const response = await this.fetch(
        url,
        {
          ...options,
          headers,
          signal: controller.signal,
        }
      );

      if (
        response.status === 401 &&
        options.authenticated !== false
      ) {
        await this.onUnauthorized();
      }

      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error.name === "AbortError") {
        throw new ApiError(
          "The server request timed out.",
          {
            status: 408,
            code: "REQUEST_TIMEOUT",
            cause: error,
          }
        );
      }

      throw new ApiError(
        "Unable to connect to MSK Print Cloud.",
        {
          status: 0,
          code: "NETWORK_ERROR",
          cause: error,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _responseError(response) {
    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return new ApiError(
      payload?.message ||
        payload?.error ||
        `Server request failed (${response.status}).`,
      {
        status: response.status,
        code:
          payload?.code ||
          "HTTP_ERROR",
        details:
          payload?.details ||
          payload?.shops ||
          null,
      }
    );
  }
}

// ==========================================
// Helpers
// ==========================================

const validateBaseUrl = (value) => {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "The API URL is invalid."
    );
  }

  const isLoopback = [
    "localhost",
    "127.0.0.1",
    "::1",
  ].includes(url.hostname);

  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      isLoopback
    )
  ) {
    throw new Error(
      "The print agent API must use HTTPS except on localhost."
    );
  }

  if (url.username || url.password) {
    throw new Error(
      "Credentials must not be included in the API URL."
    );
  }

  url.pathname = "/";
  url.search = "";
  url.hash = "";

  return url.toString();
};

const getDownloadFilename = (
  contentDisposition
) => {
  const match =
    /filename="?([^";]+)"?/i.exec(
      contentDisposition || ""
    );

  const value =
    match?.[1] || "print-job";

  return path
    .basename(value)
    .replace(
      /[^\w .()-]/g,
      "_"
    )
    .slice(0, 180);
};

const detectPrintFileType = (
  buffer
) => {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 4
  ) {
    return null;
  }

  const firstKilobyte =
    buffer.subarray(
      0,
      Math.min(
        buffer.length,
        1024
      )
    );

  if (
    firstKilobyte.includes(
      Buffer.from("%PDF-")
    )
  ) {
    return "application/pdf";
  }

  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(
        Buffer.from([
          0x89,
          0x50,
          0x4e,
          0x47,
          0x0d,
          0x0a,
          0x1a,
          0x0a,
        ])
      )
  ) {
    return "image/png";
  }

  return null;
};

module.exports = {
  ApiClient,
  ApiError,
  validateBaseUrl,
  detectPrintFileType,
};