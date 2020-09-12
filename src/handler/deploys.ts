// tslint:disable-next-line: no-submodule-imports
import 'source-map-support/register'
import Serverless from 'serverless-http'
import asyncHandler from 'express-async-handler'
import { defaultApp, defaultMiddlewares, handlerRouter, loadProperty } from '../lib/environment'
import { Resource, Event, Aggregate, AggregateOptions, ResourceNotFound } from '../lib/domain'

export interface DeployResource extends Resource {
  // todo fix this readonly mess
  // tslint:disable-next-line: readonly-keyword
  status?: 'processing' | 'success' | 'failed' | 'deleted'
  // tslint:disable-next-line: readonly-keyword
  specification?: string
}

export interface DeployEvent extends Event {
  readonly type: 'DeployCreated' | 'DeployDeleted'
}

export interface DeployCreatedEvent extends DeployEvent {
  readonly type: 'DeployCreated'
  readonly specification: string
}

export interface DeployDeletedEvent extends DeployEvent {
  readonly type: 'DeployDeleted'
}

export class Deploy extends Aggregate<DeployEvent> implements DeployResource {
  public status?: 'processing' | 'success' | 'failed' | 'deleted'
  public specification?: string
  constructor (options?: AggregateOptions) {
    super (options)
  }
  protected onDeployCreated (event: DeployCreatedEvent): void {
    // todo check version vs number use
    if (this.status || this.version !== 0 || event.number !== 1) throw new Error('Failed to apply the event.')
    // tslint:disable-next-line: no-object-mutation
    this.status = 'processing'
    // tslint:disable-next-line: no-object-mutation
    this.specification = event.specification
  }
  protected onDeployDeleted (event: DeployDeletedEvent): void {
    if (!(this.status === 'processing' || this.status === 'success' || this.status === 'failed')) throw new Error('Failed to apply the event.')
    // tslint:disable-next-line: no-object-mutation
    this.status = 'deleted'
  }
}

export const app = defaultApp()

app.get('/deploys', asyncHandler(async (req, res, next) => {
  const deploys = await Deploy.findAll<DeployEvent, Deploy>(Deploy) as DeployResource[]
  res.status(200).json(deploys.filter(resource => resource.status !== 'deleted')) 
}))

app.post('/deploys', asyncHandler(async (req, res, next) => {
  if (!req.body.specification) throw new Error('Invalid request')
  const event: DeployCreatedEvent = {
    number: 1,
    type: 'DeployCreated',
    specification: req.body.specification
  }
  // todo table/function mismatch? better way for passing prop?
  const aggregate = new Deploy({ table: loadProperty('DYNAMODB_TABLE') })
  await aggregate.commit(event)
  res.status(201).location(`/deploys/${aggregate.id}`).send()
}))

app.get('/deploys/:id', asyncHandler(async (req, res, next) => {
  const deploy = await Deploy.findOne<DeployEvent, Deploy>(Deploy, req.params.id)
  if (deploy instanceof ResourceNotFound) res.status(404).send()
  else res.status(200).json(deploy as DeployResource)
}))

app.get('/deploys/:id/events', asyncHandler(async (req, res, next) => {
  // TODO need a 404 for resource not exists
  const deploy = new Deploy({ id: req.params.id, table: loadProperty('DYNAMODB_TABLE') })
  const events = await deploy.events()
  res.status(200).json(events)
}))

app.delete('/deploys/:id', asyncHandler(async (req, res, next) => {
  const aggregate = new Deploy({ id: req.params.id, table: loadProperty('DYNAMODB_TABLE') })
  await aggregate.hydrate()
  const event: DeployDeletedEvent = {
    number: aggregate.version + 1,  // TODO the resource version should be supplied in the request (otherwise let client know they are updating against stale version of a resource)
    type: 'DeployDeleted'
  }
  await aggregate.commit(event)
  res.status(204).send()
}))

app.use(defaultMiddlewares)

export const apiHandler = Serverless(app)

export const handler = (event: any, context: any, callback: any) => {
  return handlerRouter(event, context, callback, {
    api: apiHandler
  })
}
