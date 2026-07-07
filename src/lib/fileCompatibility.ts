const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export const extensionOf = (name = "") => {
  const clean = name.split(/[?#]/)[0].toLowerCase();
  const ext = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1) : "";
  return ext.replace(/[^a-z0-9]/g, "");
};

export const inferFileType = (name = "", type = "") => {
  const cleanType = (type || "").trim();
  if (cleanType && cleanType !== "application/octet-stream") return cleanType;
  return MIME_BY_EXT[extensionOf(name)] || cleanType || "application/octet-stream";
};

export const isPdfFile = (name = "", type = "") =>
  inferFileType(name, type).includes("pdf") || extensionOf(name) === "pdf";

export const isImageFile = (name = "", type = "") =>
  inferFileType(name, type).startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(extensionOf(name));

export const isVideoFile = (name = "", type = "") =>
  inferFileType(name, type).startsWith("video/");

export const isAudioFile = (name = "", type = "") =>
  inferFileType(name, type).startsWith("audio/");

export const withInferredType = (file: File): File => {
  const type = inferFileType(file.name, file.type);
  if (type === file.type) return file;
  return new File([file], file.name, { type, lastModified: file.lastModified || Date.now() });
};
