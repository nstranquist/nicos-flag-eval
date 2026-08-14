import {
  ErrorCode,
  OpenFeatureEventEmitter,
  ProviderEvents,
  StandardResolutionReasons,
  type EvaluationContext,
  type JsonValue,
  type Logger,
  type Provider,
  type ResolutionDetails,
  type TrackingEventDetails,
} from "@openfeature/server-sdk";
import { Evaluator, type EvalContext, type EvalResult, type FlagValue, type FlagsManifest, type Rule } from "../../ts/evaluator.ts";

export type FlagEvalTrackEvent = {
  name: string;
  context: EvaluationContext;
  details: TrackingEventDetails;
};

export type FlagEvalProviderOptions = {
  manifest: FlagsManifest;
  evaluator?: Evaluator;
  onTrack?: (event: FlagEvalTrackEvent) => void;
};

export class FlagEvalProvider implements Provider {
  readonly metadata = { name: "flag-eval" } as const;
  readonly runsOn = "server" as const;
  readonly events = new OpenFeatureEventEmitter();

  private manifest!: FlagsManifest;
  private evaluator!: Evaluator;
  private flagByKey!: Map<string, FlagsManifest["flags"][number]>;
  private readonly onTrack?: (event: FlagEvalTrackEvent) => void;

  constructor(options: FlagEvalProviderOptions) {
    this.onTrack = options.onTrack;
    this.setManifest(options.manifest, options.evaluator);
  }

  async initialize(): Promise<void> {}

  async onClose(): Promise<void> {}

  track(name: string, context: EvaluationContext, details: TrackingEventDetails): void {
    this.onTrack?.({ name, context, details });
  }

  notifyConfigurationChanged(flagsChanged?: string[]): void {
    this.events.emit(ProviderEvents.ConfigurationChanged, {
      message: "flag-eval configuration changed",
      ...(flagsChanged ? { flagsChanged } : {}),
    });
  }

  replaceManifest(manifest: FlagsManifest): string[] {
    const flagsChanged = changedFlagKeys(this.manifest, manifest);
    this.setManifest(manifest);
    if (flagsChanged.length > 0) this.notifyConfigurationChanged(flagsChanged);
    return flagsChanged;
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    void logger;
    return this.resolve(flagKey, defaultValue, context, (value) => typeof value === "boolean");
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    void logger;
    return this.resolve(flagKey, defaultValue, context, (value) => typeof value === "string");
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    void logger;
    return this.resolve(flagKey, defaultValue, context, (value) => typeof value === "number" && Number.isFinite(value));
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    void logger;
    return this.resolve(flagKey, defaultValue, context, isJsonValue);
  }

  private resolve<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    accepts: (value: FlagValue) => boolean,
  ): ResolutionDetails<T> {
    const result = this.evaluator.evaluate(flagKey, toEvalContext(context));
    const flagMetadata = this.flagMetadata(flagKey);

    if (!result.found) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: "flag not registered",
        flagMetadata,
      };
    }

    if (!accepts(result.value)) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: "resolved flag value does not match the requested OpenFeature type",
        flagMetadata,
      };
    }

    return {
      value: result.value as T,
      ...(result.variant ? { variant: result.variant } : {}),
      reason: resolutionReason(result, this.flagByKey.get(flagKey)),
      flagMetadata,
    };
  }

  private flagMetadata(flagKey: string): Record<string, string | number | boolean> {
    const flag = this.flagByKey.get(flagKey);
    return {
      provider: "flag-eval",
      ...(flag ? { type: flag.type, scope: flag.scope } : {}),
      ...(flag?.owner ? { owner: flag.owner } : {}),
    };
  }

  private setManifest(manifest: FlagsManifest, evaluator?: Evaluator): void {
    this.manifest = manifest;
    this.evaluator = evaluator ?? new Evaluator(manifest);
    this.flagByKey = new Map(manifest.flags.map((flag) => [flag.key, flag]));
  }
}

function changedFlagKeys(previous: FlagsManifest, next: FlagsManifest): string[] {
  const before = new Map(previous.flags.map((flag) => [flag.key, JSON.stringify(flag)]));
  const after = new Map(next.flags.map((flag) => [flag.key, JSON.stringify(flag)]));
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((key) => before.get(key) !== after.get(key))
    .sort();
}

function resolutionReason(result: EvalResult, flag?: FlagsManifest["flags"][number]): string {
  switch (result.source) {
    case "rule":
      if (result.rule && isStaticRule(flag?.rules?.[result.rule - 1])) return StandardResolutionReasons.STATIC;
      return result.variant ? StandardResolutionReasons.SPLIT : StandardResolutionReasons.TARGETING_MATCH;
    case "default":
      return StandardResolutionReasons.DEFAULT;
    case "kill-date":
      return StandardResolutionReasons.DISABLED;
    case "process-flag":
    case "personal-override":
    case "repo-override":
      return StandardResolutionReasons.CACHED;
    default:
      return StandardResolutionReasons.UNKNOWN;
  }
}

function isStaticRule(rule?: Rule): boolean {
  return Boolean(rule && !rule.if && !rule.prereq && !rule.rollout);
}

function toEvalContext(context: EvaluationContext = {}): EvalContext {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    if (key === "targetingKey" || key === "env" || key === "project" || key === "userId" || key === "attrs") continue;
    const scalar = scalarString(value);
    if (scalar !== undefined) attrs[key] = scalar;
  }
  if (isRecord(context.attrs)) {
    for (const [key, value] of Object.entries(context.attrs)) {
      const scalar = scalarString(value);
      if (scalar !== undefined) attrs[key] = scalar;
    }
  }
  return {
    userId: scalarString(context.targetingKey) ?? scalarString(context.userId),
    env: scalarString(context.env),
    project: scalarString(context.project),
    attrs,
  };
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}
