export function loadProperty (property: 'DYNAMODB_TABLE' | string, required: boolean): string | void {
  if (process.env[property]) return process.env[property]
  if (required) throw new Error(`Missing the required ${property} environment property.`)
}

export const region = (process.env.IS_OFFLINE) ? 'us-east-1' : loadProperty('AWS_REGION', true)
