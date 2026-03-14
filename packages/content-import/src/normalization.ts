import type {
  DistanceValue,
  ScaleKey,
  ScaleSet,
  TimeValue
} from '../../shared-types/src/index.ts';

const WORKBOOK_TEXT_CORRECTIONS = new Map<string, string>([
  ['Amusment Park', 'Amusement Park'],
  ['Amusment Parks', 'Amusement Parks'],
  ['Museam', 'Museum'],
  ['Museams', 'Museums'],
  ['Forign Conssulate', 'Foreign Consulate'],
  ['Movie Theateres', 'Movie Theaters'],
  ['Hopsitals', 'Hospitals'],
  ['travled', 'traveled'],
  ['Requirments', 'Requirements'],
  ['Tallest form you perspective / sightline.', 'Tallest from your perspective / sightline.'],
  ['boths sides', 'both sides'],
  ['If multipole entrance you may choose.', 'If multiple entrances you may choose.'],
  ['The seekers musts solve the maze before asking another question.', 'The seekers must solve the maze before asking another question.'],
  ['The catergy remain disabled', 'The category remains disabled'],
  ['an e category', 'a category'],
  ['This course cannot be played during the endgame.', 'This curse cannot be played during the endgame.'],
  ['equal or great distance away', 'an equal or greater distance away']
]);

export interface NormalizedLabel {
  rawText: string;
  displayText: string;
  slug: string;
  corrected: boolean;
}

export function collapseWhitespace(rawText: string): string {
  return rawText.replace(/\s+/g, ' ').trim();
}

export function applyWorkbookCorrections(rawText: string): string {
  let result = collapseWhitespace(rawText);

  for (const [needle, replacement] of WORKBOOK_TEXT_CORRECTIONS.entries()) {
    result = result.replaceAll(needle, replacement);
  }

  return result;
}

export function slugify(rawText: string): string {
  return applyWorkbookCorrections(rawText)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

export function normalizeLabel(rawText: string): NormalizedLabel {
  const displayText = applyWorkbookCorrections(rawText);

  return {
    rawText,
    displayText,
    slug: slugify(rawText),
    corrected: collapseWhitespace(rawText) !== displayText
  };
}

export function normalizeScaleGate(rawText: string): ScaleSet | null {
  const normalized = collapseWhitespace(rawText).toLowerCase();

  const knownMappings: Record<string, ScaleKey[]> = {
    'all games': ['small', 'medium', 'large'],
    'medium & up': ['medium', 'large'],
    'medium & large': ['medium', 'large'],
    'large only': ['large'],
    'large games only': ['large']
  };

  const appliesTo = knownMappings[normalized];

  if (!appliesTo) {
    return null;
  }

  return {
    appliesTo,
    rawLabel: rawText
  };
}

export function parseDrawRule(rawText: string): { drawCount: number; pickCount: number; rawText: string } | null {
  const normalized = collapseWhitespace(rawText);
  const match = normalized.match(/Draw\s+(\d+)(?:,\s*Pick\s+(\d+))?/i);

  if (!match) {
    return null;
  }

  return {
    drawCount: Number(match[1]),
    pickCount: Number(match[2] ?? match[1]),
    rawText: normalized
  };
}

export function parseFixedMinutes(rawText: string): TimeValue | null {
  const normalized = collapseWhitespace(rawText);
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*Minutes?/i);

  if (!match) {
    return null;
  }

  return {
    seconds: Math.round(Number(match[1]) * 60),
    rawText: rawText
  };
}

export function parseScaleAwareMinutes(rawText: string): Partial<Record<ScaleKey, number>> | null {
  const normalized = collapseWhitespace(rawText);
  const patterns: Array<[RegExp, ScaleKey[]]> = [
    [/S\/M:\s*(\d+(?:\.\d+)?)\s*Minutes?\s*L:\s*(\d+(?:\.\d+)?)\s*Minutes?/i, ['small', 'medium', 'large']],
    [/S:\s*(\d+(?:\.\d+)?)\s*M:\s*(\d+(?:\.\d+)?)\s*L:\s*(\d+(?:\.\d+)?)\s*Minutes?/i, ['small', 'medium', 'large']]
  ];

  for (const [pattern, scales] of patterns) {
    const match = normalized.match(pattern);

    if (!match) {
      continue;
    }

    if (scales.length === 3 && match.length === 3) {
      const sharedMinutes = Number(match[1]);
      return {
        small: Math.round(sharedMinutes * 60),
        medium: Math.round(sharedMinutes * 60),
        large: Math.round(Number(match[2]) * 60)
      };
    }

    if (scales.length === 3 && match.length === 4) {
      return {
        small: Math.round(Number(match[1]) * 60),
        medium: Math.round(Number(match[2]) * 60),
        large: Math.round(Number(match[3]) * 60)
      };
    }
  }

  return null;
}

export function parseDistanceValue(rawText: string): DistanceValue | null {
  const parts = rawText
    .split(/\n+/)
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);

  let milesText: string | undefined;
  let metricText: string | undefined;
  let meters: number | undefined;

  for (const part of parts) {
    const milesMatch = part.match(/(\d+(?:\.\d+)?)\s*mi\b/i);
    const kmMatch = part.match(/(\d+(?:\.\d+)?)\s*km\b/i);
    const metersMatch = part.match(/(\d+(?:\.\d+)?)\s*m\b/i);

    if (milesMatch) {
      milesText = part;
    }

    if (kmMatch) {
      metricText = part;
      meters = Number(kmMatch[1]) * 1000;
    } else if (metersMatch) {
      metricText = part;
      meters = Number(metersMatch[1]);
    }
  }

  if (meters === undefined && milesText) {
    const milesMatch = milesText.match(/(\d+(?:\.\d+)?)\s*mi\b/i);
    if (milesMatch) {
      meters = Number(milesMatch[1]) * 1609.34;
    }
  }

  if (meters === undefined) {
    return null;
  }

  return {
    meters: Number(meters.toFixed(2)),
    rawText,
    milesText,
    metricText
  };
}

export function parseScaleMinutes(rawText: string): Record<ScaleKey, number> | null {
  const normalized = collapseWhitespace(rawText);
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*m\b/gi)];

  if (matches.length !== 3) {
    return null;
  }

  return {
    small: Number(matches[0][1]),
    medium: Number(matches[1][1]),
    large: Number(matches[2][1])
  };
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
