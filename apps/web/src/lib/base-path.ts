const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const normalizedBasePath = rawBasePath ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}` : "";

export function withBasePath(path: string) {
  if (!normalizedBasePath) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (normalizedPath === "/") return normalizedBasePath;
  return `${normalizedBasePath}${normalizedPath}`;
}
