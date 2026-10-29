export function buildClassBoardSlackText(input: { cycleNumber: number; boardUrl: string }) {
  return [`*Cycle ${input.cycleNumber} Progress*`, `<${input.boardUrl}|See the full board>`].join("\n");
}

export function classBoardSlackFileName(dateKey: string) {
  return `class-board-${dateKey}.png`;
}
