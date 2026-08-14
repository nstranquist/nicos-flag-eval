import type { AssignmentEvent, MetricObservation } from "./assignment";

export type VariantStatistics = {
  assignments: number;
  observations: number;
  total: number;
  mean: number | null;
};

export type ExperimentStatistics = {
  experimentKey: string;
  metricKey: string;
  variants: Record<string, VariantStatistics>;
};

/**
 * Aggregate provider-neutral assignment and metric events.
 *
 * The function does not import or call the evaluator. A warehouse adapter can
 * replace this in production while keeping this output contract and tests.
 */
export function summarizeExperiment(
  experimentKey: string,
  metricKey: string,
  assignments: readonly AssignmentEvent[],
  observations: readonly MetricObservation[],
): ExperimentStatistics {
  const selected = assignments.filter((event) => event.experimentKey === experimentKey);
  const byId = new Map(selected.map((event) => [event.eventId, event]));
  const variants: Record<string, VariantStatistics> = {};

  for (const assignment of selected) {
    variants[assignment.variant] ??= emptyStatistics();
    variants[assignment.variant].assignments += 1;
  }
  for (const observation of observations) {
    if (observation.metricKey !== metricKey) continue;
    const assignment = byId.get(observation.assignmentEventId);
    if (!assignment || assignment.subjectKey !== observation.subjectKey) continue;
    variants[assignment.variant] ??= emptyStatistics();
    const result = variants[assignment.variant];
    result.observations += 1;
    result.total += observation.value;
    result.mean = result.total / result.observations;
  }
  return { experimentKey, metricKey, variants };
}

function emptyStatistics(): VariantStatistics {
  return { assignments: 0, observations: 0, total: 0, mean: null };
}
