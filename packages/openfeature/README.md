# flag-eval OpenFeature provider

Server-side OpenFeature provider over the portable evaluator. It requires an
explicit manifest — default to `schemas/demo.manifest.json`. It does not
embed factory keys.

```ts
import { OpenFeature } from "@openfeature/server-sdk";
import { FlagEvalProvider } from "./provider";
import demo from "../../schemas/demo.manifest.json" with { type: "json" };

await OpenFeature.setProviderAndWait(new FlagEvalProvider({ manifest: demo }));
const enabled = await OpenFeature.getClient().getBooleanValue(
  "checkout.promo-banner",
  false,
  { targetingKey: "user-alice", env: "staging" },
);
```
