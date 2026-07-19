export function isConfiguredRolePlayScenarioId(value: string): boolean {
  const scenarioId = value.trim();
  return scenarioId.length > 0 && !/^pending\s*:/i.test(scenarioId);
}
