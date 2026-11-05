/**
 * The background queues when a server answers but cannot serve (429, 5xx). That is not
 * "no network": the Steam store limits about 200 requests per 5 minutes, which a large
 * library can reach. Waiting gives the limit time to pass; a server that keeps failing
 * ends the run, and the games left are tried at the next start.
 */
export const UNAVAILABLE_WAIT_MS = 60_000
export const UNAVAILABLE_LIMIT = 5
