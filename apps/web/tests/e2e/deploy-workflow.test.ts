import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const workflow = readFileSync(
  fileURLToPath(new URL("../../../../.gitea/workflows/deploy.yml", import.meta.url)),
  "utf8"
);
const baseDockerfile = readFileSync(
  fileURLToPath(new URL("../../../../apps/web/Dockerfile.base", import.meta.url)),
  "utf8"
);
const appDockerfile = readFileSync(
  fileURLToPath(new URL("../../../../apps/web/Dockerfile", import.meta.url)),
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

test("base image installs pnpm without Corepack's unreachable default registry", () => {
  assert.match(baseDockerfile, /npm install --global pnpm@\$\{PNPM_VERSION\}/);
  assert.doesNotMatch(baseDockerfile, /corepack prepare pnpm/);
  assert.match(baseDockerfile, /NPM_CONFIG_REGISTRY=["']?\$\{NPM_CONFIG_REGISTRY\}/);
});

test("deployment builds use the reachable public package registry", () => {
  assert.match(
    workflow,
    /TEAMPULSE_NPM_REGISTRY:\s*https:\/\/registry\.npmmirror\.com/,
    "the job must override the unavailable cluster cache for nested Docker builds"
  );
  const buildStep = (name: string) => {
    const start = workflow.indexOf(`- name: ${name}`);
    assert.notEqual(start, -1, `${name} step must exist`);
    const end = workflow.indexOf("\n      - name:", start + 1);
    return workflow.slice(start, end === -1 ? workflow.length : end);
  };

  for (const stepName of ["Build base image", "Build and push arch-suffixed image"]) {
    const step = buildStep(stepName);
    assert.match(step, /--build-arg\s+['"]?NPM_CONFIG_REGISTRY=\$\{TEAMPULSE_NPM_REGISTRY\}/);
  }

  assert.doesNotMatch(
    workflow,
    /--build-arg[^\n]*(?:secrets\.|TOKEN|PASSWORD|SECRET)/i,
    "registry build args must never be populated from credentials"
  );
});

test("registry arguments are propagated through every Dockerfile stage", () => {
  assert.match(baseDockerfile, /^ARG NPM_CONFIG_REGISTRY(?:=.*)?$/m);
  assert.match(baseDockerfile, /NPM_CONFIG_REGISTRY=["']?\$\{NPM_CONFIG_REGISTRY\}/);

  const stages = appDockerfile.split(/^FROM /m).slice(1);
  assert.equal(stages.length, 3, "the web image must retain its three stages");
  for (const stage of stages) {
    assert.match(stage, /^ARG NPM_CONFIG_REGISTRY(?:=.*)?$/m);
    assert.match(stage, /NPM_CONFIG_REGISTRY=["']?\$\{NPM_CONFIG_REGISTRY\}/);
  }
});
