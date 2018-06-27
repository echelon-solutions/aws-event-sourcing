/**
 * An event has a number, a type, and a creation date as an ISO string.
 */
export default interface Event {
  readonly number: number
  readonly type: string
  readonly created: string
}
