import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const workflow = readFileSync(
  fileURLToPath(new URL("../../../../.gitea/workflows/deploy.yml", import.meta.url)),
  "utf8"
);

test("deployment workflow uses the prebuilt runner toolchain", () => {
  assert.doesNotMatch(
    workflow,
    /apt-get\s+update\s+&&\s+apt-get\s+install[^\n]*docker\.io/,
    "runner images provide Docker; the job must not depend on an unavailable APT package"
  );
  assert.match(workflow, /command -v git/);
  assert.match(workflow, /command -v docker/);
  assert.match(workflow, /docker buildx version/);
});
