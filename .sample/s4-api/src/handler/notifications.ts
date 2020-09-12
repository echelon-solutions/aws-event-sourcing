import 'source-map-support/register'
import { DynamoDBStreamHandler, SNSHandler } from 'aws-lambda'
import { DynamoDB } from 'aws-sdk'
import cloudform, { Fn, ElasticBeanstalk } from 'cloudform'
import { cloudformation, handlerRouter } from '../app/environment'
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

/*
async function create (deploy: Deploy) {
  try {
    let result = await cloudformation.createChangeSet({
      StackName: resourcePrefix + deploy.id,
      ChangeSetName: resourcePrefix + deploy.id,
      ChangeSetType: 'CREATE',
      TemplateBody: await generateTemplate('s4', '/deployments/' + deploy.id + '/source'),
      NotificationARNs: [ snsTopic ]
    }).promise()
    await new Event<ChangeSet>({
      id: result.Id,
      type: 'ChangeSet',
      table: cloudTable,
      state: 'success',
      stackId: result.StackId,
      deployId: deploy.id
    }).publish()
  } catch (error) {
    console.error(error)
    await new Event(deploy).publish()
  }
}
*/

async function generateTemplate (bucket: string, key: string): Promise<string> {
  return cloudform({
    AWSTemplateFormatVersion: '2010-09-09',
    Resources: {
      Application: new ElasticBeanstalk.Application(),
      ApplicationVersion: new ElasticBeanstalk.ApplicationVersion({
        ApplicationName: Fn.Ref('Application'),
        SourceBundle: new ElasticBeanstalk.ApplicationVersion.SourceBundle({
          S3Bucket: bucket,
          S3Key: key
        })
      })
    }
  })
}

export const topicHandler: SNSHandler = async (event, context, callback) => {
  try {
    console.log(`Request received with ${event.Records.length} records.`)
    const successes = [ 'CREATE_COMPLETE' ]
    const failures = [ 'CREATE_FAILED', 'ROLLBACK_FAILED', 'ROLLBACK_COMPLETE', 'UPDATE_ROLLBACK_FAILED', 'UPDATE_ROLLBACK_COMPLETE' ]
    for (var record of event.Records) {
      console.log(record)
      let stackName = record.Sns.Message.match(new RegExp('StackName=\'(.*)\'\n'))
      let changeSetName = record.Sns.Message.match(new RegExp('ChangeSetName=\'(.*)\'\n'))
      let resourceStatus = record.Sns.Message.match(new RegExp('ResourceStatus=\'(.*)\'\n'))
      if (stackName.length > 0 && resourceStatus.length > 0) {
        if (failures.indexOf(resourceStatus[1]) > -1) {
          console.log(`Deployment failed with status ${resourceStatus[1]}.`)
        }
        else if (successes.indexOf(resourceStatus[1]) > -1) {
          await cloudformation.executeChangeSet({
            StackName: stackName[1],
            ChangeSetName: changeSetName[1]
          }).promise()
        }
      }
    }
    console.log('Success.')
    callback(); return
  } catch (error) {
    console.log('Failure.')
    console.error(error)
    callback(error); return
  }
}

export const handler = (event, context, callback) => {
  handlerRouter(event, context, callback, {
    stream: streamHandler,
    topic: topicHandler
  })
}
