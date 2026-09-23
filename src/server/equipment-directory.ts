import * as google from "googleapis/build/src/apis/people";
import type { people_v1 } from "googleapis/build/src/apis/people";
import { parseStudentId } from "@/src/lib/equipment-students";

const DIRECTORY_SCOPES = [
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/directory.readonly"
];

export type DirectoryStudent = {
  studentId: string;
  name: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

function readDirectoryCredentials(): Record<string, unknown> | null {
  const raw = process.env.GOOGLE_OAUTH_TOKEN?.trim() || process.env.GOOGLE_CREDENTIALS?.trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      console.error("Google directory credentials JSON is not an object");
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    console.error("Failed to parse Google directory credentials JSON");
    return null;
  }
}

function createDirectoryAuth(credentials: Record<string, unknown>) {
  if (credentials.type === "service_account") {
    return new google.auth.GoogleAuth({
      credentials: credentials as { client_email?: string; private_key?: string },
      scopes: DIRECTORY_SCOPES
    });
  }

  if (credentials.refresh_token || credentials.access_token) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET
    );
    oauth2.setCredentials({
      access_token: typeof credentials.access_token === "string" ? credentials.access_token : undefined,
      refresh_token: typeof credentials.refresh_token === "string" ? credentials.refresh_token : undefined
    });
    return oauth2;
  }

  return null;
}

function matchPerson(studentId: string, person: people_v1.Schema$Person | undefined): DirectoryStudent | null {
  if (!person?.emailAddresses) {
    return null;
  }

  for (const emailObj of person.emailAddresses) {
    const email = emailObj.value?.trim();
    if (!email) {
      continue;
    }
    if (parseStudentId(email) !== studentId) {
      continue;
    }

    const names = person.names?.[0];
    return {
      studentId,
      name: names?.displayName?.trim() || null,
      email,
      firstName: names?.givenName?.trim() || null,
      lastName: names?.familyName?.trim() || null
    };
  }

  return null;
}

export async function directoryLookup(studentId: string): Promise<DirectoryStudent | null> {
  const credentials = readDirectoryCredentials();
  if (!credentials) {
    return null;
  }

  const auth = createDirectoryAuth(credentials);
  if (!auth) {
    return null;
  }

  const people = google.people({ version: "v1", auth });
  const query = studentId.startsWith("950") ? studentId.slice(3) : studentId;

  try {
    try {
      const directory = await people.people.searchDirectoryPeople({
        query,
        readMask: "names,emailAddresses",
        sources: ["DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE"],
        pageSize: 10
      });
      for (const person of directory.data.people ?? []) {
        const match = matchPerson(studentId, person);
        if (match) {
          return match;
        }
      }
    } catch {
      // Directory search is optional; fall through to contacts.
    }

    const contacts = await people.people.searchContacts({
      query,
      readMask: "names,emailAddresses",
      pageSize: 10
    });
    for (const result of contacts.data.results ?? []) {
      const match = matchPerson(studentId, result.person);
      if (match) {
        return match;
      }
    }

    return null;
  } catch (error) {
    console.error("Google directory lookup failed", error);
    return null;
  }
}
