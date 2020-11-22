// tslint:disable-next-line: no-submodule-imports
import 'source-map-support/register'
import asyncHandler from 'express-async-handler'

import { Resource, Event, Aggregate, AggregateOptions, ResourceNotFound, environment } from '../../'

export interface DeployResource extends Resource {
  // todo fix this readonly mess
  readonly status?: 'processing' | 'success' | 'failed' | 'deleted'
  readonly specification?: string
}

export interface DeployCreatedEvent extends Event {
  readonly type: 'DeployCreated'
  readonly specification: string
}

export interface DeployDeletedEvent extends Event {
  readonly type: 'DeployDeleted'
}

export type DeployEvent = DeployCreatedEvent | DeployDeletedEvent

export class Deploy extends Aggregate<DeployEvent> implements DeployResource {
  public status?: 'processing' | 'success' | 'failed' | 'deleted'
  public specification?: string
  constructor (options?: AggregateOptions) {
    super (options)
  }
  protected onDeployCreated (event: DeployCreatedEvent): void {
    // todo check version vs number use
    if (this.status || this.version !== 0 || event.number !== 1) throw new Error('Failed to apply the event.')
    this.status = 'processing'
    this.specification = event.specification
  }
  protected onDeployDeleted (event: DeployDeletedEvent): void {
    if (!(this.status === 'processing' || this.status === 'success' || this.status === 'failed')) throw new Error('Failed to apply the event.')
    this.status = 'deleted'
  }
}

export const app = environment.defaultApp()

app.get('/deploys', asyncHandler(async (req, res, next) => {
  const deploys = (await Deploy.findAll(Deploy))
    .filter(resource => resource.status !== 'deleted')
    .map(resource => ({
      ...Deploy.json(resource),
      links: {
        resource: `/deploys/${resource.id}`,
        events: `/deploys/${resource.id}/events`
      }
    }))
  res.status(200).json(deploys)
}))

app.post('/deploys', asyncHandler(async (req, res, next) => {
  if (!req.body.specification) throw new Error('Invalid request')
  const aggregate = new Deploy()
  await aggregate.commit({
    number: 1,
    type: 'DeployCreated',
    specification: req.body.specification
  })
  res.status(201).location(`/deploys/${aggregate.id}`).send()
}))

app.get('/deploys/:id', asyncHandler(async (req, res, next) => {
  const deploy = await Deploy.findOne(Deploy, req.params.id)
  if (deploy instanceof ResourceNotFound) res.status(404).send()
  else res.status(200).json(Deploy.json(deploy))
}))

app.get('/deploys/:id/events', asyncHandler(async (req, res, next) => {
  const deploy = await Deploy.findOne(Deploy, req.params.id)
  if (deploy instanceof ResourceNotFound) res.status(404).send()
  else {
    const events = await deploy.events()
    res.status(200).json(events)
  }
}))

app.delete('/deploys/:id', asyncHandler(async (req, res, next) => {
  const deploy = await Deploy.findOne<DeployEvent, Deploy>(Deploy, req.params.id)
  if (deploy instanceof ResourceNotFound) res.status(404).send()
  else {
     // TODO ? the resource version should be supplied in the request (otherwise let client know they are updating against stale version of a resource)
    await deploy.commit({
      number: deploy.version + 1, 
      type: 'DeployDeleted'
    })
    res.status(204).send()
  }
}))

app.use(environment.defaultMiddlewares)

export const handler = (event: any, context: any, callback: any) => {
  return environment.router(event, context, callback, {
    api: {
      express: app
    }
  })
}
