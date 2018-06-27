import { region } from '../environment/properties'

import aws = require('aws-sdk')
import { DynamoDB } from 'aws-sdk'
import * as AWSXRay from 'aws-xray-sdk'
/* tslint:disable:no-implicit-dependencies */
import { APIGatewayProxyHandler, ScheduledHandler, SNSHandler, DynamoDBStreamHandler, APIGatewayEvent, ScheduledEvent, SNSEvent, DynamoDBStreamEvent } from 'aws-lambda'

// CLIENTS

const AWS = (process.env.IS_OFFLINE)
  ? aws
  : AWSXRay.captureAWS(aws)

export const dynamo = (process.env.IS_OFFLINE)
  ? new AWS.DynamoDB.DocumentClient({ region: 'localhost', endpoint: 'http://localhost:8000' }) as DynamoDB.DocumentClient
  : new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region }) as DynamoDB.DocumentClient

/**
 * Adds an AWS XRAY log annotation that is searchable/filterable (or not) in the console.
 */
export function xray (key: string, value: string, searchable: boolean): void {
  if (!process.env.IS_OFFLINE) {
    if (searchable) AWSXRay.getSegment().addAnnotation(key, value)
    else AWSXRay.getSegment().addMetadata(key, value)
  }
}

/**
 * A Lambda handler router that determines the proper handler to use based on the type of the received event
 */
export const handlerRouter = (event: any, context: any, callback: any, handlers: { 
  readonly api?: APIGatewayProxyHandler,
  readonly scheduled?: ScheduledHandler,
  readonly topic?: SNSHandler,
  readonly stream?: DynamoDBStreamHandler }) => {
  if ((event as APIGatewayEvent).httpMethod && handlers.api) handlers.api(event, context, callback)
  else if ((event as ScheduledEvent).source === 'aws.events' && handlers.scheduled) handlers.scheduled(event, context, callback)
  else if ((event as SNSEvent).Records && ((event as SNSEvent).Records[0].EventSource === 'aws:sns') && handlers.topic) handlers.topic(event, context, callback)
  else if ((event as DynamoDBStreamEvent).Records && ((event as DynamoDBStreamEvent).Records[0].eventSource === 'aws:dynamodb') && handlers.stream) handlers.stream(event, context, callback)
  else throw new Error('Unsupported event type received.')
}
