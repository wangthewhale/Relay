export type LucyRequiredInputs = {
  email: string;
  objective: string;
  constraints: string;
  successMetric: string;
};

export function hasRequiredLucyInputs(memory: LucyRequiredInputs) {
  const email = memory.email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && [memory.objective, memory.constraints, memory.successMetric]
      .every((value) => value.trim().length >= 3);
}
