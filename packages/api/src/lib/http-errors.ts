import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  BundleNotFoundError,
  BundleSizeLimitError,
  FileCountLimitError,
  IndexFileNotFoundError,
  ManifestNotFoundError,
  ManifestValidationError,
} from "@/lib/bundle/types";

export type ErrorResponse = {
  status: ContentfulStatusCode;
  message: string;
  expose: boolean;
};

export function mapAppError(error: unknown): ErrorResponse {
  if (error instanceof BundleNotFoundError) {
    return { status: 404, message: error.message, expose: true };
  }

  if (error instanceof BundleSizeLimitError || error instanceof FileCountLimitError) {
    return { status: 413, message: error.message, expose: true };
  }

  if (
    error instanceof ManifestNotFoundError ||
    error instanceof ManifestValidationError ||
    error instanceof IndexFileNotFoundError
  ) {
    return { status: 400, message: error.message, expose: true };
  }

  if (error instanceof HTTPException) {
    return {
      status: error.status as ContentfulStatusCode,
      message: error.message || "Request failed",
      expose: error.status < 500,
    };
  }

  return {
    status: 500,
    message: error instanceof Error ? error.message : "Internal server error",
    expose: false,
  };
}
