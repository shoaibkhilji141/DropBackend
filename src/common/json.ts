/** Parses a JSON string array stored in SQLite. Returns [] on invalid input. */
export const parseStringArray = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    }
  } catch {
    // Stored value is not valid JSON.
  }
  return [];
};

export const stringifyStringArray = (value: string[] | undefined): string | undefined => {
  if (value === undefined) return undefined;
  return JSON.stringify(value.filter((item) => item.trim().length > 0));
};
