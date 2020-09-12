import { DynamoDB, S3, CloudFormation, SNS } from 'aws-sdk'
import * as AWSXRay from 'aws-xray-sdk'
import { APIGatewayProxyHandler, ScheduledHandler, SNSHandler, DynamoDBStreamHandler, APIGatewayEvent, ScheduledEvent, SNSEvent, DynamoDBStreamEvent } from 'aws-lambda';
import * as express from 'express'

// PROPERTIES

export type Property = 'DYNAMODB_TABLE' | 'S3_BUCKET' | 'SNS_TOPIC' | 'STACK_PREFIX' | 'AWS_REGION'

export function loadProperty (property: Property, required: boolean): string | void {
  if (process.env[property]) return process.env[property]
  if (required) throw new Error(`Missing the required ${property} environment property.`)
}

export const region = (process.env.IS_OFFLINE) ? 'us-east-1' : loadProperty('AWS_REGION', true)

// CLIENTS

const AWS = (process.env.IS_OFFLINE)
  ? require('aws-sdk')
  : AWSXRay.captureAWS(require('aws-sdk'))

export const dynamo = (process.env.IS_OFFLINE)
  ? new AWS.DynamoDB.DocumentClient({ region: 'localhost', endpoint: 'http://localhost:8000' }) as DynamoDB.DocumentClient
  : new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region }) as DynamoDB.DocumentClient

export const s3 = new AWS.S3({ apiVersion: '2006-03-01', region }) as S3

export const cloudformation = new AWS.CloudFormation({ apiVersion: '2010-05-15', region }) as CloudFormation

export const sns = new AWS.SNS({ apiVersion: '2010-03-31', region }) as SNS

/**
 * Adds an AWS XRAY log annotation that is searchable/filterable (or not) in the console.
 */
export function xray (key: string, value: string, searchable: boolean): void {
  if (!process.env.IS_OFFLINE) {
    if (searchable) AWSXRay.getSegment().addAnnotation(key, value)
    else AWSXRay.getSegment().addMetadata(key, value)
  }
}

// HELPERS

/**
 * Create a new express app with defaults
 */
export function defaultApp () {
  let app = express()
  app.use(AWSXRay.express.openSegment('defaultName'))
  app.disable('x-powered-by')
  app.use(express.json())
  return app
}

/**
 * For the following middlewares to work properly, they must be the last middlewares injected by app.use()
 */
export const defaultMiddlewares = [
  (req, res, next) => {
    xray('error', 'CLIENT | 404 Not Found', true)
    res.status(404).send()
  },
  (error: Error, req, res, next) => {
    if (error.message === 'Invalid request') {
      xray('error', `CLIENT | ${error.message}`, true)
      res.status(400).json({
        message: error.message
      })
    } else {
      console.error(error)
      xray('error', `SERVER | ${error.message}`, true)
      res.status(500).json({
        message: 'Internal server error'
      })
    }
  },
  AWSXRay.express.closeSegment()
]

/**
 * A Lambda handler router that determines the proper handler to use based on the type of the received event
 */
export const handlerRouter = (event: any, context: any, callback: any, handlers: { 
  api?: APIGatewayProxyHandler,
  scheduled?: ScheduledHandler,
  topic?: SNSHandler,
  stream?: DynamoDBStreamHandler }) => {
  if ((event as APIGatewayEvent).httpMethod && handlers.api) handlers.api(event, context, callback)
  else if ((event as ScheduledEvent).source === 'aws.events' && handlers.scheduled) handlers.scheduled(event, context, callback)
  else if ((event as SNSEvent).Records && ((event as SNSEvent).Records[0].EventSource === 'aws:sns') && handlers.topic) handlers.topic(event, context, callback)
  else if ((event as DynamoDBStreamEvent).Records && ((event as DynamoDBStreamEvent).Records[0].eventSource === 'aws:dynamodb') && handlers.stream) handlers.stream(event, context, callback)
  else throw new Error('Unsupported event type received.')
}
