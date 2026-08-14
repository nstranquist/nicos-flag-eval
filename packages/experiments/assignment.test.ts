import assert from "node:assert/strict";
import test from "node:test";
import { createAssignmentEvent, createMetricObservation } from "./assignment.ts";
import { summarizeExperiment } from "./statistics.ts";

test("joins metrics to assignments without importing the evaluator", () => {
  const control = createAssignmentEvent({
    eventId: "a-control",
    experimentKey: "checkout-copy",
    variant: "control",
    subjectKey: "subject-hash-1",
    assignedAt: "2026-08-04T00:00:00.000Z",
    source: "flag-eval",
  });
  const treatment = createAssignmentEvent({
    eventId: "a-treatment",
    experimentKey: "checkout-copy",
    variant: "treatment",
    subjectKey: "subject-hash-2",
    assignedAt: "2026-08-04T00:00:01.000Z",
    source: "flag-eval",
  });
  const result = summarizeExperiment("checkout-copy", "purchase", [control, treatment], [
    createMetricObservation({
      observationId: "m-1",
      assignmentEventId: control.eventId,
      metricKey: "purchase",
      subjectKey: control.subjectKey,
      value: 1,
      observedAt: "2026-08-04T00:01:00.000Z",
    }),
    createMetricObservation({
      observationId: "m-2",
      assignmentEventId: treatment.eventId,
      metricKey: "purchase",
      subjectKey: treatment.subjectKey,
      value: 0,
      observedAt: "2026-08-04T00:01:00.000Z",
    }),
  ]);
  assert.deepEqual(result.variants.control, { assignments: 1, observations: 1, total: 1, mean: 1 });
  assert.deepEqual(result.variants.treatment, { assignments: 1, observations: 1, total: 0, mean: 0 });
});

test("rejects an observation that attempts to cross subjects", () => {
  const assignment = createAssignmentEvent({
    eventId: "a-1",
    experimentKey: "checkout-copy",
    variant: "control",
    subjectKey: "subject-hash-1",
    assignedAt: "2026-08-04T00:00:00.000Z",
    source: "external-provider",
  });
  const result = summarizeExperiment("checkout-copy", "purchase", [assignment], [
    createMetricObservation({
      observationId: "m-1",
      assignmentEventId: assignment.eventId,
      metricKey: "purchase",
      subjectKey: "subject-hash-2",
      value: 1,
      observedAt: "2026-08-04T00:01:00.000Z",
    }),
  ]);
  assert.deepEqual(result.variants.control, { assignments: 1, observations: 0, total: 0, mean: null });
});
