export const ROLES = [
  "Show Director",
  "Graphics Director",
  "Tech Director",
  "Teleprompter",
  "Floor Director",
];

export const BACKUP_ROLES = ["Backup #1", "Backup #2"];

export const ALL_ROLES = [...ROLES, ...BACKUP_ROLES];

/** Fallback roster when a caller does not pass registered users. */
export const MEMBERS = [
  "Abby",
  "Alma",
  "Celia",
  "Colin",
  "Emma",
  "Iris",
  "Kira",
  "Lena",
  "Mabel",
  "Otto",
  "Sage",
  "Toby",
];

export const EXEMPT = [];

export const STORAGE_KEY = "show_roles_history_v2";


