import 'source-map-support/register'
import * as Serverless from 'serverless-http'
import * as asyncHandler from 'express-async-handler'
import { defaultApp, defaultMiddlewares, handlerRouter } from '../app/environment'
import { Resource, Event, Aggregate, ResourceNotFound } from '../app/domain'

export interface DeployResource extends Resource {
  status?: 'processing' | 'success' | 'failed' | 'deleted'
  specification?: string
}

export interface DeployEvent extends Event {
  type: 'DeployCreated' | 'DeployDeleted'
}

export interface DeployCreatedEvent extends DeployEvent {
  type: 'DeployCreated'
  specification: string
}

export interface DeployDeletedEvent extends DeployEvent {
  type: 'DeployDeleted'
}

export class Deploy extends Aggregate<DeployEvent> implements DeployResource {
  status?: 'processing' | 'success' | 'failed' | 'deleted'
  specification?: string
  constructor (id?: string) {
    super (id)
  }
  apply (events: Array<DeployEvent>) {
    for (var event of events) {
      switch (event.type) {
        case 'DeployCreated': this.onDeployCreated(event as DeployCreatedEvent); break
        case 'DeployDeleted': this.onDeployDeleted(event as DeployDeletedEvent); break
        default: throw new Error('Unsupported event detected.')
      }
      this.version++
    }
  }
  onDeployCreated (event: DeployCreatedEvent) {
    if (this.status || event.number !== 1) throw new Error('Failed to apply the event.')
    this.status = 'processing'
    this.specification = event.specification
  }
  onDeployDeleted (event: DeployDeletedEvent) {
    if (!(this.status === 'processing' || this.status === 'success' || this.status === 'failed')) throw new Error('Failed to apply the event.')
    this.status = 'deleted'
  }
}

export const app = defaultApp()

app.get('/deploys', asyncHandler(async (req, res, next) => {
  let deploys = await Deploy.findAll<DeployEvent, Deploy>(Deploy) as DeployResource[]
  res.status(200).json(deploys.filter(resource => resource.status !== 'deleted')) 
}))

app.post('/deploys', asyncHandler(async (req, res, next) => {
  if (!req.body.specification) throw new Error('Invalid request')
  let event: DeployCreatedEvent = {
    number: 1,
    type: 'DeployCreated',
    specification: req.body.specification
  }
  let aggregate = new Deploy()
  await aggregate.commit(event)
  res.status(201).location(`/deploys/${aggregate.id}`).send()
}))

app.get('/deploys/:id', asyncHandler(async (req, res, next) => {
  let deploy = await Deploy.findOne<DeployEvent, Deploy>(req.params.id, Deploy)
  if (deploy instanceof ResourceNotFound) res.status(404).send()
  else res.status(200).json(deploy as DeployResource)
}))

app.get('/deploys/:id/events', asyncHandler(async (req, res, next) => {
  // TODO need a 404 for resource not exists
  let deploy = new Deploy(req.params.id)
  let events = await deploy.events()
  res.status(200).json(events)
}))

app.delete('/deploys/:id', asyncHandler(async (req, res, next) => {
  let aggregate = new Deploy(req.params.id)
  await aggregate.hydrate()
  let event: DeployDeletedEvent = {
    number: aggregate.version + 1,  // TODO the resource version should be supplied in the request (otherwise let client know they are updating against stale version of a resource)
    type: 'DeployDeleted'
  }
  await aggregate.commit(event)
  res.status(204).send()
}))

app.use(defaultMiddlewares)

export const apiHandler = Serverless(app)

export const handler = (event, context, callback) => {
  handlerRouter(event, context, callback, {
    api: apiHandler
  })
}
