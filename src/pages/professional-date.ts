/** Validate persisted calendar dates without allowing JavaScript date normalization. */
export function isProfessionalDate(value: string, optional = false): boolean {
  if (optional && value === "") return true;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "0001-01-01" ||
    value > "9999-12-31"
  )
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
