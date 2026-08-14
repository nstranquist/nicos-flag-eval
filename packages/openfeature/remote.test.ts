import assert from "node:assert/strict";
import test from "node:test";
import { FlagEvalProvider } from "./provider.ts";
import { ManifestSourceError, RemoteManifestSource, digestManifest, refreshProvider, validateManifest } from "./remote.ts";
import type { FlagsManifest } from "../../ts/evaluator.ts";

const manifest: FlagsManifest = {
  schemaVersion: 1,
  flags: [{ key: "remote.flag", type: "boolean", default: false, scope: "cross-project" }],
};

test("validates and replaces a provider manifest from a remote source", async () => {
  const fetchMock = async () =>
    new Response(
      JSON.stringify({
        ...manifest,
        flags: [{ ...manifest.flags[0], default: true }],
      }),
      { status: 200, headers: { etag: "v2" } },
    );
  const source = new RemoteManifestSource({ url: "https://flags.test/api/manifest", fetch: fetchMock });
  const provider = new FlagEvalProvider({ manifest });
  const result = await refreshProvider(provider, source);
  assert.equal(result.status, "updated");
  assert.equal(result.etag, "v2");
  assert.equal(result.digest, await digestManifest(result.manifest));
});

test("uses ETag revalidation on 304", async () => {
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify(manifest), { status: 200, headers: { etag: "v1" } });
    }
    return new Response(null, { status: 304 });
  };
  const source = new RemoteManifestSource({ url: "https://flags.test/api/manifest", fetch: fetchMock });
  const first = await source.refresh();
  const second = await source.refresh();
  assert.equal(first.status, "updated");
  assert.equal(second.status, "not-modified");
  assert.deepEqual(second.manifest, manifest);
});

test("rejects invalid manifests and factory scopes", () => {
  assert.throws(() =>
    validateManifest({ schemaVersion: 1, flags: [{ key: "bad", type: "number", default: "no", scope: "cross-project" }] }),
  );
  assert.throws(
    () =>
      validateManifest({
        schemaVersion: 1,
        flags: [{ key: "x.flag", type: "boolean", default: false, scope: "internal" }],
      }),
    ManifestSourceError,
  );
});

test("fails closed when a 304 arrives before the first manifest", async () => {
  const source = new RemoteManifestSource({
    url: "https://flags.test/api/manifest",
    fetch: async () => new Response(null, { status: 304 }),
  });
  await assert.rejects(() => source.refresh(), /before an initial 200/);
});
