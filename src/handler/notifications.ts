// tslint:disable-next-line: no-submodule-imports
import 'source-map-support/register'
// tslint:disable-next-line: no-implicit-dependencies
import { DynamoDBStreamHandler } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { handlerRouter } from '../lib/environment'
import { Resource, Event } from '../lib/domain'
import { DeployEvent, DeployCreatedEvent } from './deploys'

export const streamHandler: DynamoDBStreamHandler = async (event, context, callback) => {
  try {
    console.log(`Request received with ${event.Records.length} event records.`)
    for (const record of event.Records) {
      if (record.eventName === 'REMOVE') console.log('Event data is being deleted!')
      else if (record.eventName === 'MODIFY') console.log('Event data is being updated!')
      else if (record.eventName === 'INSERT') {
        if (record.dynamodb?.NewImage) {
          const unmarshalled = DynamoDB.Converter.unmarshall(record.dynamodb.NewImage) as Resource | Event
          if ((unmarshalled as DeployEvent).type === 'DeployCreated') {
            // todo fix strange type accessor below (as as)
            console.log(`A new deploy was created with specification: [${((unmarshalled as DeployEvent) as DeployCreatedEvent).specification}].`)
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
  handlerRouter(event, context, callback, {
    stream: streamHandler
  })
}
