import 'source-map-support/register'
import * as Serverless from 'serverless-http'
import * as asyncHandler from 'express-async-handler'
import { defaultApp, defaultMiddlewares, handlerRouter } from '../app/environment'
import { Aggregate, ContentResource, ContentEvent, ContentCreatedEvent, ContentEnabledEvent, ContentDisabledEvent, ResourceNotFound } from '../app/domain'

export class Content extends Aggregate<ContentEvent> implements ContentResource {
  status?: 'created' | 'enabled' | 'disabled'
  location?: string
  constructor (id?: string) {
    super (id)
  }
  apply (events: Array<ContentEvent>) {
    for (var event of events) {
      switch (event.type) {
        case 'ContentCreated': this.onContentCreated(event as ContentCreatedEvent); break
        case 'ContentEnabled': this.onContentEnabled(event as ContentEnabledEvent); break
        case 'ContentDisabled': this.onContentDisabled(event as ContentDisabledEvent); break
        default: throw new Error('Unsupported event detected.')
      }
      this.version++
    }
  }
  onContentCreated (event: ContentCreatedEvent) {
    if (this.status || this.version !== 0 || event.number !== 1) throw new Error('Failed to apply the event.')
    this.status = 'created'
    this.location = event.location
  }
  onContentEnabled (event: ContentEnabledEvent) {
    this.status = 'enabled'
  }
  onContentDisabled (event: ContentDisabledEvent) {
    this.status = 'disabled'
  }
}

export const app = defaultApp()

app.get('/content', asyncHandler(async (req, res, next) => {
  let content = await Content.findAll<ContentEvent, Content>(Content) as ContentResource[]
  res.status(200).json(content) 
}))

app.post('/content', asyncHandler(async (req, res, next) => {
  if (!req.body.specification) throw new Error('Invalid request')
  let event: ContentCreatedEvent = {
    number: 1,
    type: 'ContentCreated',
    location: '/s3/TODO'
  }
  let aggregate = new Content()
  await aggregate.commit(event)
  res.status(201).location(`/content/${aggregate.id}`).send()
}))

app.get('/content/:id', asyncHandler(async (req, res, next) => {
  let content = await Content.findOne<ContentEvent, Content>(req.params.id, Content)
  if (content instanceof ResourceNotFound) res.status(404).send()
  else res.status(200).json(content as ContentResource)
}))

app.get('/content/:id/events', asyncHandler(async (req, res, next) => {
  // TODO need a 404 for resource not exists
  let content = new Content(req.params.id)
  let events = await content.events()
  res.status(200).json(events)
}))

app.delete('/content/:id', asyncHandler(async (req, res, next) => {
  let aggregate = new Content(req.params.id)
  await aggregate.hydrate()
  let event: ContentDisabledEvent = {
    number: aggregate.version + 1,  // TODO the resource version should be supplied in the request (otherwise let client know they are updating against stale version of a resource)
    type: 'ContentDisabled'
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
