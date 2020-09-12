import 'source-map-support/register'
import { DynamoDBStreamHandler } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import { handlerRouter } from '../app/environment'
import { Resource, Event } from '../app/domain'
import { DeployEvent, DeployCreatedEvent } from './deploys'
import { ContentEvent, ContentCreatedEvent } from './content'

export const streamHandler: DynamoDBStreamHandler = async (event, context, callback) => {
  try {
    console.log(`Request received with ${event.Records.length} event records.`)
    for (let record of event.Records) {
      if (record.eventName === 'REMOVE') console.log('Event data is being deleted!')
      else if (record.eventName === 'MODIFY') console.log('Event data is being updated!')
      else {
        let unmarshalled = DynamoDB.Converter.unmarshall(record.dynamodb.NewImage) as Resource | Event
        if ((unmarshalled as DeployEvent).type === 'DeployCreated') {
          console.log(`A new deploy was created with specification: [${(unmarshalled as DeployCreatedEvent).specification}].`)
        }
        else if ((unmarshalled as ContentEvent).type === 'ContentCreated') {
          console.log(`A new content was created with location: [${(unmarshalled as ContentCreatedEvent).location}].`)
        }
      }
    }
    callback()
  } catch (error) {
    console.error(error)
    callback(error)
  }
}

export const handler = (event, context, callback) => {
  handlerRouter(event, context, callback, {
    stream: streamHandler
  })
}
