import learnsets from './generated/learnsets.json';

/** Move ids a species can learn in a regulation (prevo chain included). */
export function getLearnset(regulationId: string, speciesId: string): string[] {
	return (learnsets as Record<string, Record<string, string[]>>)[regulationId]?.[speciesId] ?? [];
}
