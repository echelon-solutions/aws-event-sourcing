
/* tslint:disable:no-object-mutation */
process.env.IS_OFFLINE = 'true'
const tableName = process.env.DYNAMODB_TABLE = 'domain-test'

/* tslint:disable:no-expression-statement */
import test from 'ava'
import DynamoDbLocal from 'dynamodb-local'
import { DynamoDB } from 'aws-sdk'
import * as domain from './domain'

test.beforeEach('setup', async t => {
  process.env.IS_OFFLINE = 'true'
})

/* tslint:disable:no-let */
let localDatabase: any

test.before('setup', async t => {
  localDatabase = await DynamoDbLocal.launch(8000)
  const client = new DynamoDB({ region: 'localhost', endpoint: 'http://localhost:8000' })
  await client.createTable({
    TableName: tableName,
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
})

test('We can create a resource', async t => {
  const resource: domain.Resource = { id: '123' }
  t.deepEqual(resource.id, '123')
})

test('We can create an event', async t => {
  const event: domain.Event = { number: 1, type: 'SomeEvent' }
  t.deepEqual(event.number, 1)
  t.deepEqual(event.type, 'SomeEvent')
})

test('We can create an aggregate', async t => {
  const aggregate = new domain.Aggregate<domain.Event>()
  t.truthy(aggregate.id)
})
test('The number of events after creating an aggregate should be zero', async t => {
  const events = await new domain.Aggregate<domain.Event>().events()
  t.is(events.length, 0)
})

test('The version after creating an aggregate should be zero', async t => {
  const aggregate = new domain.Aggregate<domain.Event>()
  t.is(aggregate.version, 0)
})

test('We can create an aggregate then save an event', async t => {
  await new domain.Aggregate<domain.Event>().commit({
    number: 1,
    type: 'Event'
  })
  t.pass()
})

test('We can create an aggregate for a specific table then save an event', async t => {
  await new domain.Aggregate<domain.Event>({ table: tableName }).commit({
    number: 1,
    type: 'Event'
  })
  t.pass()
})

test('The number of events after creating an aggregate then saving an event should be one', async t => {
  const aggregate = new domain.Aggregate<domain.Event>()
  await aggregate.commit({
    number: 1,
    type: 'Event'
  })
  t.is((await aggregate.events()).length, 1)
})

test('The version after creating an aggregate then saving an event should be one', async t => {
  const aggregate = new domain.Aggregate<domain.Event>()
  await aggregate.commit({
    number: 1,
    type: 'Event'
  })
  t.is(aggregate.version, 1)
})

test('We should not be able to save an event that the aggregate does not support', async t => {
  try {
    await new domain.Aggregate<domain.Event>().commit({
      number: 1,
      type: 'UnsupportedEvent'
    })
    t.fail()
  } catch (error) {
    if (error instanceof domain.IllegalEventArgument) t.pass()
    else t.fail()
  }
})

test('We should not be able to create an event with an out of order number', async t => {
  const aggregate = new domain.Aggregate<domain.Event>()
  await aggregate.commit({
    number: 1,
    type: 'Event'
  })
  try {
    await aggregate.commit({
      number: 3,
      type: 'Event'
    })
    t.fail()
  } catch (error) {
    if (error instanceof domain.IllegalEventNumberArgument) t.pass()
    else t.fail()
  }
})

test('The number of events after creating an aggregate then saving two events should be two', async t => {
  const aggregate = new domain.Aggregate<domain.Event>()
  await aggregate.commit({
    number: 1,
    type: 'Event'
  })
  await aggregate.commit({
    number: 2,
    type: 'Event'
  })
  t.is((await aggregate.events()).length, 2)
})

test('The version after creating an aggregate then saving two events should be two', async t => {
  const aggregate = new domain.Aggregate<domain.Event>()
  await aggregate.commit({
    number: 1,
    type: 'Event'
  })
  await aggregate.commit({
    number: 2,
    type: 'Event'
  })
  t.is(aggregate.version, 2)
})

test('We can fetch an aggregate by id', async t => {
  const aggregate = new domain.Aggregate<domain.Event>()
  await aggregate.commit({
    number: 1,
    type: 'Event'
  })
  const fetch = await domain.Aggregate.findOne<domain.Event, domain.Aggregate<domain.Event>>(domain.Aggregate, aggregate.id)
  if (fetch instanceof domain.ResourceNotFound) t.fail()
  else {
    await fetch.hydrate()
    t.deepEqual(aggregate.id, fetch.id)
  }
})

test('We should return ResourceNotFound when fetching with a nonexistent id', async t => {
  const fetch = await domain.Aggregate.findOne<domain.Event, domain.Aggregate<domain.Event>>(domain.Aggregate, 'some-nonexistent-id')
  if (fetch instanceof domain.ResourceNotFound) t.pass()
  else t.fail()
})

test('We can fetch all aggregates', async t => {
  await new domain.Aggregate<domain.Event>().commit({
    number: 1,
    type: 'Event'
  })
  await new domain.Aggregate<domain.Event>().commit({
    number: 1,
    type: 'Event'
  })
  const aggregates = await domain.Aggregate.findAll<domain.Event, domain.Aggregate<domain.Event>>(domain.Aggregate)
  if (aggregates.length < 2) t.fail()
  else t.pass()
})

test.after.always('teardown', async t => {
  await DynamoDbLocal.stop(localDatabase)
})
