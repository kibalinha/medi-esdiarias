export interface ComputeDeltaInput {
  currentValue: number | null | undefined;
  previousValue: number | null | undefined;
  currentDate?: string | null;
  previousDate?: string | null;
  multiplierFactor?: number | null;
  dialCapacity?: number | null;
  isRollover?: boolean;
  isMeterReplaced?: boolean;
  replacementBaseline?: number | null;
}

export interface ComputeDeltaResult {
  delta: number | null;
  isDropWithoutFlag: boolean;
  isMultiDayDelta: boolean;
  isRolloverApplied: boolean;
  isReplacedApplied: boolean;
}

const MS_PER_DAY = 86_400_000;

export function diffDaysIso(
  previousDate: string | null | undefined,
  currentDate: string | null | undefined,
): number | null {
  if (!previousDate || !currentDate) return null;
  const prevMs = Date.parse(`${previousDate.slice(0, 10)}T00:00:00Z`);
  const currMs = Date.parse(`${currentDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(prevMs) || Number.isNaN(currMs)) return null;
  return Math.round((currMs - prevMs) / MS_PER_DAY);
}

export function inferDialCapacity(previousValue: number): number {
  if (previousValue <= 0) return 10000;
  const digits = Math.max(4, Math.floor(Math.log10(previousValue)) + 1);
  return 10 ** digits;
}

/**
 * Deterministic cumulative meter delta calculation.
 * Supports normal progression, explicit dial rollover, meter replacement,
 * multiplier factors (e.g. CAG x1000), and multi-day gaps across year boundaries.
 */
export function computeCumulativeDelta(
  input: ComputeDeltaInput,
): ComputeDeltaResult {
  const {
    currentValue,
    previousValue,
    currentDate,
    previousDate,
    multiplierFactor = 1,
    dialCapacity,
    isRollover = false,
    isMeterReplaced = false,
    replacementBaseline = 0,
  } = input;

  const factor =
    multiplierFactor !== null &&
    multiplierFactor !== undefined &&
    Number.isFinite(multiplierFactor)
      ? multiplierFactor
      : 1;

  if (
    currentValue === null ||
    currentValue === undefined ||
    !Number.isFinite(currentValue)
  ) {
    return {
      delta: null,
      isDropWithoutFlag: false,
      isMultiDayDelta: false,
      isRolloverApplied: false,
      isReplacedApplied: false,
    };
  }

  const daysApart = diffDaysIso(previousDate, currentDate);
  const isMultiDayDelta = daysApart !== null && daysApart > 1;

  if (isMeterReplaced) {
    const baseline =
      replacementBaseline !== null &&
      replacementBaseline !== undefined &&
      Number.isFinite(replacementBaseline)
        ? replacementBaseline
        : 0;
    const rawDelta = Math.max(0, currentValue - baseline);
    return {
      delta: roundFloat(rawDelta * factor),
      isDropWithoutFlag: false,
      isMultiDayDelta,
      isRolloverApplied: false,
      isReplacedApplied: true,
    };
  }

  if (
    previousValue === null ||
    previousValue === undefined ||
    !Number.isFinite(previousValue)
  ) {
    return {
      delta: null,
      isDropWithoutFlag: false,
      isMultiDayDelta: false,
      isRolloverApplied: false,
      isReplacedApplied: false,
    };
  }

  if (currentValue >= previousValue) {
    return {
      delta: roundFloat((currentValue - previousValue) * factor),
      isDropWithoutFlag: false,
      isMultiDayDelta,
      isRolloverApplied: false,
      isReplacedApplied: false,
    };
  }

  // currentValue < previousValue
  if (isRollover) {
    const capacity =
      dialCapacity !== null &&
      dialCapacity !== undefined &&
      Number.isFinite(dialCapacity) &&
      dialCapacity > previousValue
        ? dialCapacity
        : inferDialCapacity(previousValue);
    const rawDelta = Math.max(0, capacity - previousValue + currentValue);
    return {
      delta: roundFloat(rawDelta * factor),
      isDropWithoutFlag: false,
      isMultiDayDelta,
      isRolloverApplied: true,
      isReplacedApplied: false,
    };
  }

  // Unflagged drop: do not silently zero out
  return {
    delta: null,
    isDropWithoutFlag: true,
    isMultiDayDelta,
    isRolloverApplied: false,
    isReplacedApplied: false,
  };
}

export function roundFloat(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
