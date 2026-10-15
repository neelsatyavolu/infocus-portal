/**
 * Soft retries the board's error page has made since the board last received data. Module state,
 * so the count survives the error boundary re-rendering between retries; a full reload resets it.
 */
let retriesWithoutData = 0;

export function noteBoardRetry() {
  retriesWithoutData += 1;
  return retriesWithoutData;
}

export function clearBoardRetries() {
  retriesWithoutData = 0;
}
