import {
  clearOrder,
  formatCount,
  formatShare,
  marginLine,
  measureResult,
  parseCandidates,
  parseCount,
  parseFigures,
  parseParty,
  parseStats,
  ranked,
  seatSplit,
  statusLabel,
  withShares,
  MAX_CANDIDATES,
  type Party,
  type RaceStatus
} from "@/src/lib/story-results";
import { CheckIcon, Face, Frame, Tag, kickerField, noteField, photoOf, sourceField, text, type StoryField, type StoryValues } from "./story-parts";
import type { CanvasTemplate } from "./story-templates";

/**
 * Results templates: a race, a Yes/No measure, seats, a called race's winner, and key figures.
 * Wording stays neutral: a race only "wins" when someone picks Called (docs/SOCIAL-MEDIA-DESIGN.md).
 */

const asOfField: StoryField = { key: "meta", type: "text", label: "As of", def: "As of 7:00 PM PT · Nov. 3, 2026", hint: "When the numbers are from. Required on every results post." };
const PARTY_OPTIONS = [
  { value: "D", label: "Democrat" },
  { value: "R", label: "Republican" },
  { value: "I", label: "Independent / other" },
  { value: "N", label: "Nonpartisan" }
] as const;

const AsOf = ({ value }: { value: string }) => (value ? <div className="sm-meta" style={{ marginTop: "calc(16px * var(--k))" }}>{value}</div> : null);

const candidatePhotoFields: StoryField[] = Array.from({ length: 4 }, (_, index) => ({
  key: `face${index + 1}`,
  type: "photo" as const,
  label: `Photo for candidate ${index + 1} (optional)`,
  showIf: (v: StoryValues) => parseCandidates(text(v, "candidates")).length > index
}));

function RaceBody(v: StoryValues) {
  const seats = Math.max(1, Math.min(MAX_CANDIDATES - 1, parseCount(text(v, "seats")) ?? 1));
  const listed = withShares(parseCandidates(text(v, "candidates")), parseCount(text(v, "other")) ?? 0);
  const photos = new Map(listed.map((c, index) => [c, photoOf(v, `face${index + 1}`)]));
  const order = ranked(listed);
  // Mixed units or a tie at the cutoff: no leader or winner is named, whatever the status says.
  const clear = clearOrder(listed, seats);
  const chosen = (text(v, "status") || "none") as RaceStatus;
  const status: RaceStatus = clear || chosen === "close" || chosen === "none" ? chosen : "none";
  const called = status === "wins";
  const max = Math.max(1, ...order.map((c) => c.share ?? 0));
  const density = order.length > 5 ? " sm-many" : order.length > 3 ? " sm-mid" : "";
  const leader = order[0];
  const tag = statusLabel(status, leader, seats);
  const margin = clear ? marginLine(listed, seats) : "";
  const problem = listed.some((c) => c.share === null) ? "Give every candidate votes, or every candidate a share." : !clear && listed.length > seats ? "Tied at the cutoff: no leader is shown." : "";
  return (
    <>
      <div className={`sm-rows${density}`}>
        {order.map((c, index) => {
          const inside = index < seats;
          return (
            <div key={`${c.name}-${index}`} style={{ display: "contents" }}>
              {seats > 1 && index === seats ? (
                <div className="sm-cutline"><span>{margin}</span><span>Top {seats} win</span></div>
              ) : null}
              <div className={inside ? "sm-row" : "sm-row sm-faded"}>
                {inside && seats === 1 ? <div className="sm-hl" /> : null}
                <Face name={c.name} party={c.party} photo={photos.get(c) ?? null} className="sm-av" />
                <div className="sm-cand">
                  {c.name}
                  {c.label ? <small>{c.label}</small> : null}
                  {called && inside ? <span className="sm-check"><CheckIcon /></span> : null}
                </div>
                <div className="sm-pct">
                  {formatShare(c.share)}
                  {c.votes !== null ? <small>{formatCount(c.votes)} votes</small> : null}
                </div>
                <div className="sm-track"><div className={`sm-fill sm-${c.party}`} style={{ width: `${((c.share ?? 0) / max) * 100}%` }} /></div>
              </div>
            </div>
          );
        })}
      </div>
      {problem ? <div className="sm-gap-label">{problem}</div> : null}
      {tag || (seats === 1 && margin) ? (
        <div className="sm-after">
          {tag ? <Tag label={tag} fill={called && leader ? leader.party : null} check={called} /> : null}
          {seats === 1 && margin ? <span className="sm-margin">{margin}</span> : null}
        </div>
      ) : null}
    </>
  );
}

const race: CanvasTemplate = {
  kind: "canvas",
  id: "race",
  name: "Race results",
  description: "Every candidate with their share, votes and a bar. One seat or several.",
  fields: [
    kickerField("City Council"),
    { key: "headline", type: "text", label: "Race", def: "Palo Alto" },
    asOfField,
    { key: "reporting", type: "text", label: "How much is counted", def: "62% of expected vote in", hint: "Leave it empty to hide it." },
    {
      key: "candidates",
      type: "textarea",
      label: `Candidates, one per line (up to ${MAX_CANDIDATES})`,
      rows: 5,
      def: "Alex Rivera | N | 15,110 | Incumbent\nSam Okafor | N | 14,018\nJordan Lee | N | 13,749\nCasey Park | N | 9,254",
      hint: "Name | Party (D, R, I or N) | Votes or a share like 48.2% | Label. Shares are worked out from votes."
    },
    { key: "other", type: "text", label: "Other votes (optional)", def: "", hint: "Write-ins and anyone not listed, so shares match the source." },
    { key: "seats", type: "text", label: "Seats", def: "3", hint: "How many win. Above 1 draws a line under the winning spots." },
    {
      key: "status",
      type: "select",
      label: "Status",
      def: "none",
      options: [
        { value: "none", label: "No tag" },
        { value: "leads", label: "Leading (not called)" },
        { value: "close", label: "Too close to call" },
        { value: "wins", label: "Called" }
      ]
    },
    ...candidatePhotoFields,
    noteField("Not yet called. More ballots will be counted this week."),
    sourceField("Santa Clara County Registrar of Voters")
  ],
  render: (v) => (
    <Frame kicker={text(v, "kicker")} source={text(v, "source")} note={text(v, "note")} top>
      <div className="sm-h1">{text(v, "headline")}</div>
      <AsOf value={text(v, "meta")} />
      {text(v, "reporting") ? <div className="sm-sub" style={{ marginTop: 8 }}>{text(v, "reporting")}</div> : null}
      <div className="sm-gap-l" />
      <RaceBody {...v} />
    </Frame>
  )
};

const MEASURE_TAGS: Record<string, { label: (yes: number, no: number) => string; fill: "Y" | "X" | null; check: boolean }> = {
  leads: { label: (yes, no) => (yes >= no ? "Yes leads" : "No leads"), fill: null, check: false },
  close: { label: () => "Too close to call", fill: null, check: false },
  passes: { label: () => "Passes", fill: "Y", check: true },
  fails: { label: () => "Fails", fill: "X", check: true }
};

const measure: CanvasTemplate = {
  kind: "canvas",
  id: "measure",
  name: "Yes / No",
  description: "A ballot measure or any yes-or-no vote, with the line it needs to pass.",
  fields: [
    kickerField("Palo Alto"),
    { key: "headline", type: "text", label: "Measure", def: "Measure A" },
    asOfField,
    { key: "sub", type: "text", label: "What it does", def: "Half-cent sales tax for city services", hint: "One line." },
    { key: "yes", type: "text", label: "Yes", def: "14,158", hint: "Votes, or a share like 51.6%." },
    { key: "no", type: "text", label: "No", def: "13,266" },
    { key: "threshold", type: "text", label: "Needs", def: "50", hint: "Yes share needed to pass: 50, 55 or 66.67." },
    {
      key: "status",
      type: "select",
      label: "Status",
      def: "leads",
      options: [
        { value: "none", label: "No tag" },
        { value: "leads", label: "Leading (not called)" },
        { value: "close", label: "Too close to call" },
        { value: "passes", label: "Called: passes" },
        { value: "fails", label: "Called: fails" }
      ]
    },
    noteField("Not yet called. More ballots will be counted this week."),
    sourceField("Santa Clara County Registrar of Voters")
  ],
  render: (v) => {
    const result = measureResult(text(v, "yes"), text(v, "no"), text(v, "threshold") || "50");
    const tag = MEASURE_TAGS[text(v, "status")];
    const needs = result ? (result.threshold === 50 ? "Needs a majority" : `Needs ${formatShare(result.threshold)}`) : "";
    const distance = result
      ? result.pointsFromThreshold >= 0
        ? `${result.pointsFromThreshold.toFixed(1)} points over the ${formatShare(result.threshold).replace(".0%", "%")} it needs`
        : `${Math.abs(result.pointsFromThreshold).toFixed(1)} points short of the ${formatShare(result.threshold).replace(".0%", "%")} it needs`
      : "";
    return (
      <Frame kicker={text(v, "kicker")} source={text(v, "source")} note={text(v, "note")}>
        <div className="sm-h1">{text(v, "headline")}</div>
        <AsOf value={text(v, "meta")} />
        {text(v, "sub") ? <div className="sm-sub" style={{ marginTop: 8 }}>{text(v, "sub")}</div> : null}
        <div className="sm-gap-l" />
        {result ? (
          <>
            <div className="sm-yn">
              <div className="sm-yn-side"><div className="sm-yn-k sm-Y">Yes</div><div className="sm-yn-big">{formatShare(result.yesShare)}</div></div>
              <div className="sm-yn-side"><div className="sm-yn-k">No</div><div className="sm-yn-big">{formatShare(result.noShare)}</div></div>
            </div>
            <div className="sm-bar-wrap">
              <div className="sm-bar">
                <div className="sm-seg sm-Y" style={{ width: `${result.yesShare}%` }} />
                <div className="sm-seg sm-X" style={{ width: `${result.noShare}%` }} />
              </div>
              <div className="sm-tick" style={{ left: `${result.threshold}%` }} />
              <div className="sm-tick-label" style={{ left: `${result.threshold}%` }}>{needs}</div>
            </div>
            <div className="sm-gap-label">{distance}</div>
            {result.yes + result.no > 0 ? <div className="sm-counts" style={{ marginTop: 16 }}>{formatCount(result.yes)} yes · {formatCount(result.no)} no</div> : null}
            {tag ? <div className="sm-after"><Tag label={tag.label(result.yesShare, result.noShare)} fill={tag.fill} check={tag.check} /></div> : null}
          </>
        ) : (
          <div className="sm-sub">Type the Yes and No votes to draw the bar.</div>
        )}
      </Frame>
    );
  }
};

const seats: CanvasTemplate = {
  kind: "canvas",
  id: "seats",
  name: "Seats",
  description: "Who controls a chamber: seats for each side and the majority line.",
  fields: [
    kickerField("Midterms 2026"),
    { key: "headline", type: "text", label: "Chamber", def: "U.S. Senate" },
    asOfField,
    { key: "total", type: "text", label: "Total seats", def: "100" },
    { key: "majority", type: "text", label: "Seats to win", def: "51" },
    { key: "dem", type: "text", label: "Democratic seats", def: "48" },
    { key: "rep", type: "text", label: "Republican seats", def: "47" },
    { key: "demSub", type: "text", label: "Under “Democrats”", def: "Includes independents who vote with Democrats", hint: "Optional." },
    { key: "statusText", type: "text", label: "Status", def: "", hint: "e.g. “Democrats win control”. Only once it’s called. Leave it empty for no tag." },
    { key: "statusParty", type: "select", label: "Status color", def: "D", options: [{ value: "D", label: "Democratic blue" }, { value: "R", label: "Republican red" }] },
    noteField("Five races have not been called."),
    sourceField("Decision Desk HQ")
  ],
  render: (v) => {
    const split = seatSplit(text(v, "total"), text(v, "dem"), text(v, "rep"));
    const majority = Math.min(split.total, parseCount(text(v, "majority")) ?? Math.floor(split.total / 2) + 1);
    const status = text(v, "statusText").trim();
    return (
      <Frame kicker={text(v, "kicker")} source={text(v, "source")} note={text(v, "note")}>
        <div className="sm-h1">{text(v, "headline")}</div>
        <AsOf value={text(v, "meta")} />
        <div className="sm-gap-l" />
        <div className="sm-seats">
          <div className="sm-seat-line">
            <div className="sm-tile sm-D">D</div>
            <div className="sm-big">{split.dem}</div>
            <div className="sm-party">Democrats{text(v, "demSub") ? <small>{text(v, "demSub")}</small> : null}</div>
          </div>
          <div className="sm-seat-line">
            <div className="sm-tile sm-R">R</div>
            <div className="sm-big">{split.rep}</div>
            <div className="sm-party">Republicans</div>
          </div>
        </div>
        <div className="sm-bar-wrap">
          <div className="sm-bar">
            <div className="sm-seg sm-D" style={{ width: `${(split.dem / split.total) * 100}%` }} />
            <div className="sm-seg sm-R" style={{ width: `${(split.rep / split.total) * 100}%` }} />
          </div>
          <div className="sm-tick" style={{ left: `${(majority / split.total) * 100}%` }} />
          <div className="sm-tick-label" style={{ left: `${(majority / split.total) * 100}%` }}>{majority} to win</div>
        </div>
        {status ? <div className="sm-after" style={{ marginTop: 48 }}><Tag label={status} fill={parseParty(text(v, "statusParty"))} check /></div> : null}
        {split.undecided && !status ? <div className="sm-counts" style={{ marginTop: 40 }}>{split.undecided} not yet called</div> : null}
      </Frame>
    );
  }
};

const winner: CanvasTemplate = {
  kind: "canvas",
  id: "winner",
  name: "Winner",
  description: "The big first slide once a race is called: the winner, one line and three figures.",
  fields: [
    { key: "photo", type: "photo", label: "Winner’s photo" },
    kickerField("City Council"),
    { key: "headline", type: "text", label: "Headline", def: "Rivera wins", hint: "Only once the race is called." },
    asOfField,
    { key: "name", type: "text", label: "Full name", def: "Alex Rivera" },
    { key: "party", type: "select", label: "Party", def: "N", options: PARTY_OPTIONS },
    { key: "dek", type: "text", label: "One line", def: "Wins a second term on the City Council" },
    { key: "tag", type: "text", label: "Tag", def: "Re-elected", hint: "A few words, e.g. “Democratic flip”. Leave it empty to hide it." },
    { key: "stats", type: "textarea", label: "Figures, one per line (up to 3)", rows: 3, def: "1,092 | votes ahead\n23.5% | Rivera\n21.8% | Okafor", hint: "Figure | Label | Party (D or R colors it)." },
    { key: "note", type: "textarea", label: "Who called it", def: "Projected by the Santa Clara County Registrar of Voters on Nov. 10.", rows: 2 },
    sourceField("Santa Clara County Registrar of Voters")
  ],
  render: (v) => {
    const party: Party = parseParty(text(v, "party"));
    const stats = parseStats(text(v, "stats"));
    return (
      <Frame kicker={text(v, "kicker")} source={text(v, "source")} note={text(v, "note")}>
        <div className="sm-h1 sm-xl">{text(v, "headline")}</div>
        <AsOf value={text(v, "meta")} />
        <div className="sm-gap-l" />
        <div className="sm-who">
          <Face name={text(v, "name")} party={party} photo={photoOf(v, "photo")} className="sm-hero" />
          <div>
            <div className="sm-who-name">{text(v, "name")}</div>
            {text(v, "dek") ? <div className="sm-who-dek">{text(v, "dek")}</div> : null}
            {text(v, "tag") ? <Tag label={text(v, "tag")} fill={party} check /> : null}
          </div>
        </div>
        {stats.length ? (
          <div className="sm-stats" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
            {stats.map((stat, index) => (
              <div key={index}>
                <div className={stat.party ? `sm-stat-f sm-text-${stat.party}` : "sm-stat-f"}>{stat.figure}</div>
                <div className="sm-stat-w">{stat.label}</div>
              </div>
            ))}
          </div>
        ) : null}
      </Frame>
    );
  }
};

const figures: CanvasTemplate = {
  kind: "canvas",
  id: "figures",
  name: "Key figures",
  description: "Up to four big figures, each with what it means. For context and explainers.",
  fields: [
    kickerField("By the numbers"),
    { key: "headline", type: "text", label: "Headline", def: "Why it matters" },
    { key: "meta", type: "text", label: "Date or byline", def: "", hint: "Optional." },
    {
      key: "figures",
      type: "textarea",
      label: "Figures, one per line (up to 4)",
      rows: 4,
      def: "80+ | Clubs at the fair | The most since 2019\n3 | Lunch periods | The fair runs across all of them\n1 | Place to sign up | The Quad, not the gym",
      hint: "Figure | What it is | One line of detail | Party (optional, D or R colors the figure)."
    },
    noteField(),
    sourceField("ASB")
  ],
  render: (v) => {
    const list = parseFigures(text(v, "figures"));
    return (
      <Frame kicker={text(v, "kicker")} source={text(v, "source")} note={text(v, "note")} top>
        <div className="sm-h1">{text(v, "headline")}</div>
        <AsOf value={text(v, "meta")} />
        <div className="sm-gap" />
        <ul className="sm-figs">
          {list.map((item, index) => (
            <li key={index}>
              <div className={item.party ? `sm-fig sm-text-${item.party}` : "sm-fig"}>{item.figure}</div>
              <div>
                <div className="sm-fig-what">{item.title}</div>
                {item.detail ? <div className="sm-fig-why">{item.detail}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      </Frame>
    );
  }
};

export const RESULT_TEMPLATES: CanvasTemplate[] = [race, measure, seats, winner, figures];
