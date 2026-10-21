const REPO_URL = "https://github.com/neelsatyavolu/infocus-portal";
const CONTACT_EMAIL = "neel@xanom.co";

/**
 * Who built the Portal, how, that it is open source, and how to contribute. One copy for the
 * public home page and Settings → About; each passes its own inline-link style.
 */
export function AboutPortalText({ linkClassName }: { linkClassName: string }) {
  return (
    <>
      <p>
        I&apos;m{" "}
        <a href="https://n3el.dev" className={linkClassName}>
          Neel Satyavolu
        </a>
        , and I built the InFocus Portal to run the class: package cycles, cut review, grades, the show calendar,
        the teleprompter, meetings, and the rest of what you see here.
      </p>
      <p>
        It&apos;s a Next.js and TypeScript app with a Postgres database, running on Cloudflare Workers. Videos are
        stored on InFocus Drive, a NAS that the class runs itself, and there are companion apps for iPhone and Mac.
      </p>
      <p>
        The Portal is open source under the MIT license. All of the code is public on{" "}
        <a href={REPO_URL} className={linkClassName} target="_blank" rel="noreferrer">
          GitHub
        </a>
        . Student data, grades, and media are not in the code and never will be.
      </p>
      <p>
        Contributions and suggestions are welcome. Open an issue or a pull request on GitHub, or email me at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className={linkClassName}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </>
  );
}
