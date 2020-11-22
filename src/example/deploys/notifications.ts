// tslint:disable-next-line: no-submodule-imports
import 'source-map-support/register'
// tslint:disable-next-line: no-implicit-dependencies
import { DynamoDBStreamHandler } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { environment } from '../../'
import { DeployCreatedEvent } from './deploys'

export const streamHandler: DynamoDBStreamHandler = async (event, context, callback) => {
  try {
    console.log(`Request received with ${event.Records.length} event records.`)
    for (const record of event.Records) {
      if (record.eventName === 'REMOVE') console.log('Event data is being deleted!')
      else if (record.eventName === 'MODIFY') console.log('Event data is being updated!')
      else if (record.eventName === 'INSERT') {
        if (record.dynamodb?.NewImage) {
          const { type, specification } = DynamoDB.Converter.unmarshall(record.dynamodb.NewImage) as Partial<DeployCreatedEvent>
          if (type === 'DeployCreated' && specification) {
            console.log(`A new deploy was created with specification: [${specification}].`)
          }
        }
      }
    }
    callback()
  } catch (error) {
    console.error(error)
    callback(error)
  }
}

export const handler = (event: any, context: any, callback: any) => {
  return environment.router(event, context, callback, {
    stream: streamHandler
  })
}
