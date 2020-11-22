import { DynamoDB } from 'aws-sdk'
import AWSXRay from 'aws-xray-sdk'
/* tslint:disable:no-implicit-dependencies */
import { APIGatewayProxyHandler, APIGatewayProxyHandlerV2, SQSHandler, ScheduledHandler, SNSHandler, DynamoDBStreamHandler, APIGatewayProxyEvent, APIGatewayProxyEventV2, SQSEvent, ScheduledEvent, SNSEvent, DynamoDBStreamEvent } from 'aws-lambda'
import express, { Express } from 'express'
import serverless from 'serverless-http'

// ERRORS

export class BaseError extends Error {
  // We have to do complicated things to set the error prototype to be able to use instanceof on the error
  // This is an issue with Typescript and es5, maybe fixable when using webpack w/ es6?
  /* tslint:disable:member-access variable-name */
  __proto__: Error
  constructor (message: string) {
    const trueProto = new.target.prototype
    super(message)
    this.__proto__ = trueProto
  }
}

export class PropertyNotFound extends BaseError {
  constructor (property: string) {
    super (`Missing the required ${property} environment property.`)
  }
}

export class UnroutableEventType extends BaseError {
  constructor () {
    super ('Unroutable unsupported event type received.')
  }
}

// PROPERTIES

export type Property = 'DYNAMODB_TABLE' | 'AWS_REGION'

export function loadPropertyOptional (property: Property): string | undefined {
  if (process.env[property]) return process.env[property]
  return undefined
}

export function loadProperty (property: Property): string {
  const value = loadPropertyOptional(property)
  if (!value) throw new PropertyNotFound(property)
  return value
}

// CLIENTS

/* tslint:disable:no-var-requires */
const AWS = (process.env.IS_OFFLINE)
  ? require('aws-sdk')
  : AWSXRay.captureAWS(require('aws-sdk'))

export const dynamo = (process.env.IS_OFFLINE)
  ? new AWS.DynamoDB.DocumentClient({ region: 'localhost', endpoint: 'http://localhost:8000' }) as DynamoDB.DocumentClient
  : new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: loadProperty('AWS_REGION') }) as DynamoDB.DocumentClient

/**
 * Adds an AWS XRAY log annotation that is searchable/filterable (or not) in the console.
 */
export function xray (key: string, value: string, searchable: boolean): void {
  // we exclude testing the AWS XRAY telemetry code from code coverage
  /* istanbul ignore if */
  if (!process.env.IS_OFFLINE) {
    if (searchable) AWSXRay.getSegment()?.addAnnotation(key, value)
    else AWSXRay.getSegment()?.addMetadata(key, value)
  }
}

// HELPERS

/**
 * Create a new express app with defaults
 */
export function defaultApp (): express.Express {
  const app = express()
  app.use(AWSXRay.express.openSegment('defaultName'))
  app.disable('x-powered-by')
  app.use(express.json())
  return app
}

/**
 * For the following middlewares to work properly, they must be the last middlewares injected by app.use()
 */
/* tslint:disable:readonly-array */
export const defaultMiddlewares = [
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    xray('error', 'CLIENT | 404 Not Found', true)
    res.status(404).send()
  },
  (error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
export const router = (event: any, context: any, callback: any, handlers: { 
  readonly api?: {
    readonly proxy?: APIGatewayProxyHandler
    readonly proxyV2?: APIGatewayProxyHandlerV2
    readonly express?: Express
    readonly serverless?: ReturnType<typeof serverless>
  },
  readonly queue?: SQSHandler
  readonly scheduled?: ScheduledHandler
  readonly topic?: SNSHandler
  readonly stream?: DynamoDBStreamHandler }) => {
  const isProxyEvent = (event as APIGatewayProxyEvent).httpMethod
  const isProxyV2Event = (event as APIGatewayProxyEventV2).requestContext?.http?.method
  const isApiEvent = isProxyEvent || isProxyV2Event
  if (isProxyEvent && handlers.api?.proxy) return handlers.api.proxy(event, context, callback)
  else if (isProxyV2Event && handlers.api?.proxyV2) return handlers.api.proxyV2(event, context, callback)
  else if (isApiEvent && handlers.api?.express) return serverless(handlers.api.express)(event, context)
  else if (isApiEvent && handlers.api?.serverless) return handlers.api.serverless(event, context)
  else if ((event as SQSEvent).Records && ((event as SQSEvent).Records[0].eventSource === 'aws:sqs') && handlers.queue) return handlers.queue(event, context, callback)
  else if ((event as ScheduledEvent).source === 'aws.events' && handlers.scheduled) return handlers.scheduled(event, context, callback)
  else if ((event as SNSEvent).Records && ((event as SNSEvent).Records[0].EventSource === 'aws:sns') && handlers.topic) return handlers.topic(event, context, callback)
  else if ((event as DynamoDBStreamEvent).Records && ((event as DynamoDBStreamEvent).Records[0].eventSource === 'aws:dynamodb') && handlers.stream) return handlers.stream(event, context, callback)
  else throw new UnroutableEventType()
}
