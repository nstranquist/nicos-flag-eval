export type AssignmentEvent = {
  schemaVersion: 1;
  eventId: string;
  experimentKey: string;
  variant: string;
  subjectKey: string;
  assignedAt: string;
  source: string;
};

export type MetricObservation = {
  schemaVersion: 1;
  observationId: string;
  assignmentEventId: string;
  metricKey: string;
  subjectKey: string;
  value: number;
  observedAt: string;
};

export function createAssignmentEvent(input: Omit<AssignmentEvent, "schemaVersion">): AssignmentEvent {
  requireText(input.eventId, "eventId");
  requireText(input.experimentKey, "experimentKey");
  requireText(input.variant, "variant");
  requireText(input.subjectKey, "subjectKey");
  requireText(input.source, "source");
  requireTimestamp(input.assignedAt, "assignedAt");
  return { schemaVersion: 1, ...input };
}

export function createMetricObservation(input: Omit<MetricObservation, "schemaVersion">): MetricObservation {
  requireText(input.observationId, "observationId");
  requireText(input.assignmentEventId, "assignmentEventId");
  requireText(input.metricKey, "metricKey");
  requireText(input.subjectKey, "subjectKey");
  if (!Number.isFinite(input.value)) throw new Error("value must be finite");
  requireTimestamp(input.observedAt, "observedAt");
  return { schemaVersion: 1, ...input };
}

function requireText(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
}

function requireTimestamp(value: string, field: string): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${field} must be an ISO timestamp`);
}
