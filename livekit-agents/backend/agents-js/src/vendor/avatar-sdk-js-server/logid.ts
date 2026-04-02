import { nanoid } from "nanoid";

/**
 * Generate a unique log ID in the format "YYYYMMDDHHMMSS_<nanoid>".
 * The timestamp is generated in UTC.
 */
export function generateLogId(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  const seconds = String(now.getUTCSeconds()).padStart(2, "0");

  const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;
  const suffix = nanoid(12);

  return `${timestamp}_${suffix}`;
}
