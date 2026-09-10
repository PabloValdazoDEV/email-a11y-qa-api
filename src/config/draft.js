const MEBIBYTE = 1024 * 1024;

export const draftConfig = Object.freeze({
  htmlMaxBytes: MEBIBYTE,
  jsonBodyMaxBytes: MEBIBYTE + (64 * 1024),
  allowedExtensions: Object.freeze([".html", ".htm"]),
  allowedMimeTypes: Object.freeze(["text/html", "application/xhtml+xml"]),
  genericMimeTypes: Object.freeze(["", "text/plain", "application/octet-stream"]),
});
