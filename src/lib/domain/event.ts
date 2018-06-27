/**
 * An event has a number, a type, and a creation date as an ISO string.
 */
export default interface Event {
  number: number
  type: string
  created: string
}
