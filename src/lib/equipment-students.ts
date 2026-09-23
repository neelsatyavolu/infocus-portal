export function parseStudentId(email: string): string | null {
  const match = email.match(/([a-z]+)(\d+)@pausd\.us/i);
  if (match) {
    const digits = match[2];
    return "950" + digits;
  }
  return null;
}
