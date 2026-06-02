/** Genera .ics y enlace Google Calendar para una reserva de cancha. */

function formatIcsInstant(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z/, "Z");
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildReservationIcs(input: {
  uid: string;
  title: string;
  description: string;
  location?: string;
  startsAt: Date;
  endsAt: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MATCHPOINT//Reserva//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}@matchpoint.top`,
    `DTSTAMP:${formatIcsInstant(new Date())}`,
    `DTSTART:${formatIcsInstant(input.startsAt)}`,
    `DTEND:${formatIcsInstant(input.endsAt)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `DESCRIPTION:${escapeIcsText(input.description)}`,
  ];
  if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function downloadIcsFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildGoogleCalendarUrl(input: {
  title: string;
  details: string;
  location?: string;
  startsAt: Date;
  endsAt: Date;
}): string {
  const fmt = (d: Date) => formatIcsInstant(d).replace(/Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${fmt(input.startsAt)}/${fmt(input.endsAt)}`,
    details: input.details,
  });
  if (input.location) params.set("location", input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
