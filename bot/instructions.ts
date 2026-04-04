export const VERIFIED_TOKEN_CONTEXT_SYSTEM_INSTRUCTION =
  "Use this verified token context if relevant to the user question.";

export function buildVerifiedTokenContextSystemMessage(
  facts: string[],
  sourceUrls: string[],
): string {
  const contextLines = [
    VERIFIED_TOKEN_CONTEXT_SYSTEM_INSTRUCTION,
    ...facts.map((fact) => `${fact}`),
  ];
  if (sourceUrls.length > 0) contextLines.push(`Sources: ${sourceUrls.join(", ")}`);
  return contextLines.join("\n");
}

