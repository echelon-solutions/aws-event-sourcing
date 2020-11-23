/* tslint:disable:no-object-mutation */
process.env.IS_OFFLINE = 'true'

/* tslint:disable:no-expression-statement */
import test from 'ava'
import request from 'supertest'
import express from 'express'
import serverless from 'serverless-http'
import * as environment from './environment'

test.beforeEach('setup', async t => {
  process.env.IS_OFFLINE = 'true'
  process.env.DYNAMODB_TABLE = 'some-table'
})

test('We can load an environment property', async t => {
  process.env.DYNAMODB_TABLE = 'someTable'
  const property = environment.loadProperty('DYNAMODB_TABLE')
  if (property) t.truthy(property)
  else t.fail()
})

test('We should get an error if the property is required but is nonexistent', async t => {
  /* tslint:disable:no-delete */
  delete process.env.DYNAMODB_TABLE
  try {
    environment.loadProperty('DYNAMODB_TABLE')
    t.fail()
  } catch (error) {
    if (error instanceof environment.PropertyNotFound) t.pass()
    else t.fail()
  }
})

test('We should not get an error if the property is optional and is nonexistent', async t => {
  /* tslint:disable:no-delete */
  delete process.env.DYNAMODB_TABLE
  environment.loadPropertyOptional('DYNAMODB_TABLE')
  t.pass()
})

test('We can create a new usable express app with defaults', async t => {
  const app = environment.defaultApp()
  app.use('/something', (req, res, next) => {
    res.send()
  })
  t.pass()
})

test('The default express middlewares return an HTTP 404 for a nonexistent route', async t => {
  const app = environment.defaultApp()
  app.use(environment.defaultMiddlewares)
  const response = await request(app).get('/foo/bar').send()
  t.is(response.status, 404)
})

test('The default express middlewares return an HTTP 400 for an Invalid request error', async t => {
  const app = environment.defaultApp()
  app.get('/', (req, res, next) => {
    throw new Error('Invalid request')
  })
  app.use(environment.defaultMiddlewares)
  const response = await request(app).get('/').send()
  t.is(response.status, 400)
})

test('The default express middlewares return an HTTP 500 for an error', async t => {
  const app = environment.defaultApp()
  app.get('/', (req, res, next) => {
    throw new Error('An expected fake test error')
  })
  app.use(environment.defaultMiddlewares)
  const response = await request(app).get('/').send()
  t.is(response.status, 500)
})

test('The handler router can route an API Gateway proxy event', async t => {
  /* tslint:disable:no-let */
  let routed = false
  environment.router({ httpMethod: 'GET' }, null, null, {
    api: {
      proxy: (event, context, callback) => {
        routed = true
      }
    }
  })
  t.is(routed, true)
})

test('The handler router can route an API Gateway proxy v2 event', async t => {
  /* tslint:disable:no-let */
  let routed = false
  environment.router({ requestContext: { http: { method: 'GET' } } }, null, null, {
    api: {
      proxyV2: (event, context, callback) => {
        routed = true
      }
    }
  })
  t.is(routed, true)
})

test('The handler router can route an API Gateway proxy event to an express app', async t => {
  /* tslint:disable:no-let */
  let routed = false
  await environment.router({ httpMethod: 'GET' }, null, null, {
    api: {
      express: express().use((req, res) => {
        routed = true
        res.send()
      })
    }
  })
  t.is(routed, true)
})

test('The handler router can route an API Gateway proxy v2 event to an express app', async t => {
  /* tslint:disable:no-let */
  let routed = false
  await environment.router({ requestContext: { http: { method: 'GET' } } }, null, null, {
    api: {
      express: express().use((req, res) => {
        routed = true
        res.send()
      })
    }
  })
  t.is(routed, true)
})

test('The handler router can route an API Gateway proxy event to a serverless http handler', async t => {
  /* tslint:disable:no-let */
  let routed = false
  await environment.router({ httpMethod: 'GET' }, null, null, {
    api: {
      serverless: serverless(express().use((req, res) => {
        routed = true
        res.send()
      }))
    }
  })
  t.is(routed, true)
})

test('The handler router can route an API Gateway proxy v2 event to a serverless http handler', async t => {
  /* tslint:disable:no-let */
  let routed = false
  await environment.router({ requestContext: { http: { method: 'GET' } } }, null, null, {
    api: {
      serverless: serverless(express().use((req, res) => {
        routed = true
        res.send()
      }))
    }
  })
  t.is(routed, true)
})

test('The handler router can route an SQS event', async t => {
  /* tslint:disable:no-let */
  let routed = false
  environment.router({ Records: [ { eventSource: 'aws:sqs' } ] }, null, null, {
    queue: (event, context, callback) => {
      routed = true
    }
  })
  t.is(routed, true)
})

test('The handler router can route a scheduled event', async t => {
  /* tslint:disable:no-let */
  let routed = false
  environment.router({ source: 'aws.events' }, null, null, {
    scheduled: (event, context, callback) => {
      routed = true
    }
  })
  t.is(routed, true)
})

test('The handler router can route an SNS event', async t => {
  /* tslint:disable:no-let */
  let routed = false
  environment.router({ Records: [ { EventSource: 'aws:sns' } ] }, null, null, {
    topic: (event, context, callback) => {
      routed = true
    }
  })
  t.is(routed, true)
})

test('The handler router can route a DynamoDB Stream event', async t => {
  /* tslint:disable:no-let */
  let routed = false
  environment.router({ Records: [ { eventSource: 'aws:dynamodb' } ] }, null, null, {
    stream: (event, context, callback) => {
      routed = true
    }
  })
  t.is(routed, true)
})

test('The handler router should throw an error for unsupported events', async t => {
  try {
    environment.router('random', null, null, {})
    t.fail()
  } catch (error) {
    if (error instanceof environment.UnroutableEventType) t.pass()
    else t.fail()
  }
})

test('The handler router should throw an error if a proxy event is detected but no api handler is configured', async t => {
  try {
    await environment.router({ httpMethod: 'GET' }, null, null, {})
    t.fail()
  } catch (error) {
    if (error instanceof environment.UnroutableEventType) t.pass()
    else t.fail()
  }
})

test('The handler router should throw an error if a proxy v2 event is detected but no api handler is configured', async t => {
  try {
    await environment.router({ requestContext: { http: { method: 'GET' } } }, null, null, {})
    t.fail()
  } catch (error) {
    if (error instanceof environment.UnroutableEventType) t.pass()
    else t.fail()
  }
})
