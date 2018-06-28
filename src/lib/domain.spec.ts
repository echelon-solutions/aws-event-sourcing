// tslint:disable:no-expression-statement
import { test } from 'ava'
import * as domain from './domain'

test('resource instantiated', async t => {
  const resource: domain.Resource = { id: '123' }
  t.deepEqual(resource.id, '123')
})

test('event instantiated', async t => {
  const date = new Date().toISOString()
  const event: domain.Event = { number: 1, type: 'SomeEvent', created: date }
  t.deepEqual(event.number, 1)
  t.deepEqual(event.type, 'SomeEvent')
  t.deepEqual(event.created, date)
})
