// Helpers compartidos (client + server) para nombres y teléfono en registro/onboarding.

const NAME_LOCALE = "es-EC";

export function capitalizeWord(word: string): string {
  if (!word) return word;
  const lower = word.toLocaleLowerCase(NAME_LOCALE);
  return lower.charAt(0).toLocaleUpperCase(NAME_LOCALE) + lower.slice(1);
}

/** Capitaliza cada palabra mientras el usuario escribe (campos de nombre). */
export function formatPersonNameInput(value: string): string {
  return value.replace(/(\S)(\S*)/g, (_, first: string, rest: string) =>
    first.toLocaleUpperCase(NAME_LOCALE) + rest.toLocaleLowerCase(NAME_LOCALE),
  );
}

/** Normaliza un segmento de nombre ya validado (server). */
export function formatPersonNameField(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalizeWord)
    .join(" ");
}

/** Parte display_name del registro en first/last + display_name canónico. */
export function parsePersonName(raw: string): {
  firstName: string;
  lastName: string;
  displayName: string;
} {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const parts = trimmed.split(" ").filter(Boolean).map(formatPersonNameField);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");
  const displayName = lastName ? `${firstName} ${lastName}` : firstName;
  return { firstName, lastName, displayName };
}

/** Solo dígitos y símbolos típicos de teléfono (+, espacios, paréntesis, guiones). */
export function formatPhoneInput(value: string): string {
  return value.replace(/[^\d+()\s-]/g, "");
}

/** Identidad lista tras signup email (nombre + username; apellido opcional). */
export function isOnboardingIdentityComplete(row: {
  username: string | null;
  first_name: string | null;
}): boolean {
  return !!(row.username?.trim() && row.first_name?.trim());
}
