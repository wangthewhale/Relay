export type LucyRequiredInputs = {
  objective: string;
  constraints: string;
  successMetric: string;
};

export function hasRequiredLucyInputs(memory: LucyRequiredInputs) {
  return [memory.objective, memory.constraints, memory.successMetric]
    .every((value) => value.trim().length >= 3);
}
