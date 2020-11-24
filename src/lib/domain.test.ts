setTestEnvironmentVariables()

import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import DynamoDbLocal from 'dynamodb-local'
import { DynamoDB } from 'aws-sdk'

import * as domain from './domain'

function setTestEnvironmentVariables (): void {
  process.env.IS_OFFLINE = 'true'
  process.env.DYNAMODB_TABLE = 'domain-test'
  process.env.AWS_ACCESS_KEY_ID = 'fake-unusable-test-value-for-access-key-id'
  process.env.AWS_SECRET_ACCESS_KEY = 'fake-unusable-test-value-for-secret-access-key'
}

describe('domain', function (): void {

  this.timeout(10 * 1000)

  beforeEach('setup environment variables', () => setTestEnvironmentVariables())

  /* tslint:disable:no-let */
  let localDatabase: any
  let launched = false

  // tslint:disable-next-line: only-arrow-functions
  before('setup dynamodb local', async function (): Promise<void> {
    if (!launched) {
      setTestEnvironmentVariables()
      localDatabase = await DynamoDbLocal.launch(8000)
      launched = true
    }
    const dynamoDb = new DynamoDB({ region: 'localhost', endpoint: 'http://localhost:8000' })
    try {
      await dynamoDb.describeTable({ TableName: 'domain-test' }).promise()
    } catch (error) {
      if (error.code !== 'ResourceNotFoundException') throw error
      await dynamoDb.createTable({
        TableName: process.env.DYNAMODB_TABLE || 'domain-test',
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
          { AttributeName: 'number', AttributeType: 'N' }
        ],
        KeySchema: [
          { AttributeName: 'id', KeyType: 'HASH' },
          { AttributeName: 'number', KeyType: 'RANGE' }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1
        }
      }).promise()
    }
  })

  it('should be able to create a resource', () => {
    const resource: domain.Resource = { id: '123' }
    expect(resource.id).to.deep.equal('123')
  })

  it('should be able to crate an event', () => {
    const event: domain.Event = { number: 1, type: 'SomeEvent' }
    expect(event.number).to.deep.equal(1)
    expect(event.type).to.deep.equal('SomeEvent')
  })

  it('should be able to create an aggregate', () => {
    const aggregate = new domain.Aggregate()
    expect(aggregate.id.length > 0).to.deep.equal(true)
  })

  it('should have zero events after creating an aggregate', async () => {
    const events = await new domain.Aggregate().events()
    expect(events.length).to.deep.equal(0)
  })

  it('should have a version of zero after creating an aggregate', () => {
    const aggregate = new domain.Aggregate()
    expect(aggregate.version).to.deep.equal(0)
  })

  it('should be able to create an aggregate then save an event', async () => {
    await new domain.Aggregate().commit({
      number: 1,
      type: 'Event'
    })
  })

  it('should be able to create an aggregate for a specific table then save an event', async () => {
    await new domain.Aggregate({ table: 'domain-test' }).commit({
      number: 1,
      type: 'Event'
    })
  })

  it('should have one event after creating an aggregate then saving an event', async () => {
    const aggregate = new domain.Aggregate()
    await aggregate.commit({
      number: 1,
      type: 'Event'
    })
    const events = await aggregate.events()
    expect(events.length).to.deep.equal(1)
  })
  
  it('should have a version of one after creating an aggregate then saving an event', async () => {
    const aggregate = new domain.Aggregate()
    await aggregate.commit({
      number: 1,
      type: 'Event'
    })
    expect(aggregate.version).to.deep.equal(1)
  })

  it('should not be able to save an event that the aggregate does not support', async () => {
    try {
      await new domain.Aggregate().commit({
        number: 1,
        type: 'UnsupportedEvent'
      })
      expect.fail()
    } catch (error) {
      if (!(error instanceof domain.IllegalEventArgument)) expect.fail()
    }
  })
  
  it('should not be able to create an event with an out of order number', async () => {
    const aggregate = new domain.Aggregate()
    await aggregate.commit({
      number: 1,
      type: 'Event'
    })
    try {
      await aggregate.commit({
        number: 3,
        type: 'Event'
      })
      expect.fail()
    } catch (error) {
      if (!(error instanceof domain.IllegalEventNumberArgument)) expect.fail()
    }
  })

  it('should have two events after creating an aggregate then saving two events', async () => {
    const aggregate = new domain.Aggregate()
    await aggregate.commit({
      number: 1,
      type: 'Event'
    })
    await aggregate.commit({
      number: 2,
      type: 'Event'
    })
    const events = await aggregate.events()
    expect(events.length).to.deep.equal(2)
  })

  it('should have a version of two after creating an aggregate then saving two events', async () => {
    const aggregate = new domain.Aggregate()
    await aggregate.commit({
      number: 1,
      type: 'Event'
    })
    await aggregate.commit({
      number: 2,
      type: 'Event'
    })
    expect(aggregate.version).to.deep.equal(2)
  })

  it('should be able to fetch an aggregate by id', async () => {
    const aggregate = new domain.Aggregate()
    await aggregate.commit({
      number: 1,
      type: 'Event'
    })
    const fetch = await domain.Aggregate.findOne(domain.Aggregate, aggregate.id)
    if (fetch instanceof domain.ResourceNotFound) expect.fail()
    else {
      await fetch.hydrate()
      expect(aggregate.id).to.deep.equal(fetch.id)
    }
  })

  it('should return ResourceNotFound when fetching with a nonexistent id', async () => {
    const fetch = await domain.Aggregate.findOne(domain.Aggregate, 'some-nonexistent-id')
    if (!(fetch instanceof domain.ResourceNotFound)) expect.fail()
  })

  it('should be able to fetch all aggregates', async () => {
    await new domain.Aggregate().commit({
      number: 1,
      type: 'Event'
    })
    await new domain.Aggregate().commit({
      number: 1,
      type: 'Event'
    })
    const aggregates = await domain.Aggregate.findAll(domain.Aggregate)
    if (aggregates.length < 2) expect.fail()
  })

  it('should be able to get a json representation of the aggregate, without the table field', async () => {
    const aggregates = await domain.Aggregate.findAll(domain.Aggregate)
    for (const aggregate of aggregates) {
      expect(aggregate.table.length > 0).to.deep.equal(true)
      const json = domain.Aggregate.json(aggregate)
      expect((json as any).table).to.deep.equal(undefined)
    }
  })

  after('teardown dynamodb local', () => DynamoDbLocal.stop(localDatabase))

})
