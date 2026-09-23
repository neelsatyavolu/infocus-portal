const pacificDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit"
});

export function publicationDateKey(now = new Date()) {
  return pacificDate.format(now);
}

export function isPublicationDue(showDate: string, startDate: string, hour: number, now = new Date()) {
  const today = publicationDateKey(now);
  if (showDate < startDate || showDate > today) return false;
  if (showDate < today) return true;
  const currentHour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", hour: "2-digit", hourCycle: "h23"
  }).format(now));
  return currentHour >= hour;
}

export function youtubeWatchUrl(videoId: string) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID");
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeEmbedCode(videoId: string) {
  youtubeWatchUrl(videoId);
  return `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" title="InFocus package" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
}
