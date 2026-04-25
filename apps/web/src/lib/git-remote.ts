type GitHostKind = "github" | "gitlab" | "gitea";

export type GitRemoteLinks = {
  repository_url: string;
  pulls_url: string;
  branch_url: (branch: string) => string;
  compare_url: (branch: string, baseBranch?: string) => string;
};

export function gitRemoteLinks(remoteUrl: string | null | undefined): GitRemoteLinks | null {
  const parsed = parseGitRemote(remoteUrl);
  if (!parsed) return null;

  const repositoryUrl = `${parsed.origin}/${parsed.repoPath}`;
  const kind = hostKind(parsed.host);

  return {
    repository_url: repositoryUrl,
    pulls_url: pullsUrl(repositoryUrl, kind),
    branch_url: (branch) => branchUrl(repositoryUrl, kind, branch),
    compare_url: (branch, baseBranch = "main") => compareUrl(repositoryUrl, kind, baseBranch, branch),
  };
}

function parseGitRemote(remoteUrl: string | null | undefined) {
  const cleaned = remoteUrl?.trim().replace(/\.git$/, "").replace(/\/$/, "");
  if (!cleaned) return null;

  const scpLike = cleaned.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (scpLike && !cleaned.includes("://")) {
    return {
      origin: `https://${scpLike[1]}`,
      host: scpLike[1],
      repoPath: trimRepoPath(scpLike[2]),
    };
  }

  try {
    const url = new URL(cleaned);
    if (!url.hostname || !url.pathname) return null;
    const protocol = url.protocol === "http:" ? "http:" : "https:";
    return {
      origin: `${protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`,
      host: url.hostname,
      repoPath: trimRepoPath(url.pathname),
    };
  } catch {
    return null;
  }
}

function trimRepoPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, "");
}

function hostKind(host: string): GitHostKind {
  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (host === "gitlab.com" || host.endsWith(".gitlab.com")) return "gitlab";
  return "gitea";
}

function branchUrl(repositoryUrl: string, kind: GitHostKind, branch: string): string {
  const encoded = encodeURIComponent(branch);
  if (kind === "github") return `${repositoryUrl}/tree/${encoded}`;
  if (kind === "gitlab") return `${repositoryUrl}/-/tree/${encoded}`;
  return `${repositoryUrl}/src/branch/${encoded}`;
}

function pullsUrl(repositoryUrl: string, kind: GitHostKind): string {
  if (kind === "gitlab") return `${repositoryUrl}/-/merge_requests`;
  return `${repositoryUrl}/pulls`;
}

function compareUrl(
  repositoryUrl: string,
  kind: GitHostKind,
  baseBranch: string,
  headBranch: string
): string {
  const base = encodeURIComponent(baseBranch);
  const head = encodeURIComponent(headBranch);
  if (kind === "github") return `${repositoryUrl}/compare/${base}...${head}`;
  if (kind === "gitlab") return `${repositoryUrl}/-/compare/${base}...${head}`;
  return `${repositoryUrl}/compare/${base}...${head}`;
}
