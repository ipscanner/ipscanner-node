import { IPScannerError } from './errors';

/** Encode one path parameter so it stays a single segment of the request path. */
export function pathParam(value: string): string {
  if (value === '' || value === '.' || value === '..') {
    throw new IPScannerError(`Invalid path parameter ${JSON.stringify(value)}: it must not be empty, "." or "..".`);
  }
  try {
    return encodeURIComponent(value);
  } catch (cause) {
    throw new IPScannerError(`Invalid path parameter ${JSON.stringify(value)}: it is not well-formed Unicode.`, {
      cause,
    });
  }
}
