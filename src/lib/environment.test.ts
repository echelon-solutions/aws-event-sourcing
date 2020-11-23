process.env.IS_OFFLINE = 'true'
process.env.DYNAMODB_TABLE = 'domain-test'

import { describe, it } from 'mocha'
import { expect } from 'chai'
import request from 'supertest'
import express from 'express'
import serverless from 'serverless-http'

import * as environment from './environment'

describe('environment', function (): void {

  // tslint:disable-next-line: only-arrow-functions
  this.beforeEach('setup environment variables', function (): void {
    process.env.IS_OFFLINE = 'true'
    process.env.DYNAMODB_TABLE = 'domain-test'
  })

  describe('environment variables', () => {

    it('can load an environment property', () => {
      process.env.DYNAMODB_TABLE = 'someTable'
      const property = environment.loadProperty('DYNAMODB_TABLE')
      expect(property).to.deep.equal('someTable')
    })
  
    it('should get an error if the property is required but is nonexistent', () => {
      /* tslint:disable:no-delete */
      delete process.env.DYNAMODB_TABLE
      try {
        environment.loadProperty('DYNAMODB_TABLE')
        expect.fail()
      } catch (error) {
        if (!(error instanceof environment.PropertyNotFound)) expect.fail()
      }
    })

    it('should not get an error if the property is optional and is nonexistent', () => {
      /* tslint:disable:no-delete */
      delete process.env.DYNAMODB_TABLE
      environment.loadPropertyOptional('DYNAMODB_TABLE')
    })

  })

  describe('default express middlewares', () => {

    it('can create a new usable express app with defaults', () => {
      const app = environment.defaultApp()
      app.use('/something', (req, res, next) => {
        res.send()
      })
    })

    it('should return an HTTP 404 for a nonexistent route', async () => {
      const app = environment.defaultApp()
      app.use(environment.defaultMiddlewares)
      const response = await request(app).get('/foo/bar').send()
      expect(response.status).to.deep.equal(404)
    })

    it('should return an HTTP 400 for an Invalid request error', async () => {
      const app = environment.defaultApp()
      app.get('/', (req, res, next) => {
        throw new Error('Invalid request')
      })
      app.use(environment.defaultMiddlewares)
      const response = await request(app).get('/').send()
      expect(response.status).to.deep.equal(400)
    })

    it('should return an HTTP 500 for an error', async () => {
      const app = environment.defaultApp()
      app.get('/', (req, res, next) => {
        throw new Error('An expected fake test error')
      })
      app.use(environment.defaultMiddlewares)
      const response = await request(app).get('/').send()
      expect(response.status).to.deep.equal(500)
    })

  })

  describe('handler router', () => {

    it('can route an API Gateway proxy event', () => {
      /* tslint:disable:no-let */
      let routed = false
      environment.router({ httpMethod: 'GET' }, null, null, {
        api: {
          proxy: (event, context, callback) => {
            routed = true
          }
        }
      })
      expect(routed).to.deep.equal(true)
    })

    it('can route an API Gateway proxy v2 event', () => {
      /* tslint:disable:no-let */
      let routed = false
      environment.router({ requestContext: { http: { method: 'GET' } } }, null, null, {
        api: {
          proxyV2: (event, context, callback) => {
            routed = true
          }
        }
      })
      expect(routed).to.deep.equal(true)
    })

    it('can route an API Gateway proxy event to an express app', async () => {
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
      expect(routed).to.deep.equal(true)
    })

    it('can route an API Gateway proxy v2 event to an express app', async () => {
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
      expect(routed).to.deep.equal(true)
    })

    it('can route an API Gateway proxy event to a serverless http handler', async () => {
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
      expect(routed).to.deep.equal(true)
    })

    it('can route an API Gateway proxy v2 event to a serverless http handler', async () => {
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
      expect(routed).to.deep.equal(true)
    })

    it('can route an SQS event', () => {
      /* tslint:disable:no-let */
      let routed = false
      environment.router({ Records: [ { eventSource: 'aws:sqs' } ] }, null, null, {
        queue: (event, context, callback) => {
          routed = true
        }
      })
      expect(routed).to.deep.equal(true)
    })

    it('can route a scheduled event', () => {
      /* tslint:disable:no-let */
      let routed = false
      environment.router({ source: 'aws.events' }, null, null, {
        scheduled: (event, context, callback) => {
          routed = true
        }
      })
      expect(routed).to.deep.equal(true)
    })

    it('can route an SNS event', () => {
      /* tslint:disable:no-let */
      let routed = false
      environment.router({ Records: [ { EventSource: 'aws:sns' } ] }, null, null, {
        topic: (event, context, callback) => {
          routed = true
        }
      })
      expect(routed).to.deep.equal(true)
    })

    it('can route a DynamoDB Stream event', () => {
      /* tslint:disable:no-let */
      let routed = false
      environment.router({ Records: [ { eventSource: 'aws:dynamodb' } ] }, null, null, {
        stream: (event, context, callback) => {
          routed = true
        }
      })
      expect(routed).to.deep.equal(true)
    })

    it('should throw an error for unsupported events', () => {
      try {
        environment.router('random', null, null, {})
        expect.fail()
      } catch (error) {
        if (!(error instanceof environment.UnroutableEventType)) expect.fail()
      }
    })

    it('should throw an error if a proxy event is detected but no api handler is configured', async () => {
      try {
        await environment.router({ httpMethod: 'GET' }, null, null, {})
        expect.fail()
      } catch (error) {
        if (!(error instanceof environment.UnroutableEventType)) expect.fail()
      }
    })

    it('should throw an error if a proxy v2 event is detected but no api handler is configured', async () => {
      try {
        await environment.router({ requestContext: { http: { method: 'GET' } } }, null, null, {})
        expect.fail()
      } catch (error) {
        if (!(error instanceof environment.UnroutableEventType)) expect.fail()
      }
    })

  })

})
