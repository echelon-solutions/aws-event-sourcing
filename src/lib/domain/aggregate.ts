import Resource from './resource'
import Event from './event'

import { dynamo, xray } from '../environment/aws'
import { loadProperty } from '../environment/properties'

import { v4 } from 'uuid'

const table = loadProperty('DYNAMODB_TABLE', true) as string

export class Aggregate<BaseEventType extends Event> implements Resource {
  id: string
  version: number
  /**
   * Instantiate an aggregate instance, optionally passing in a resource id 
   *   to reference an existing resource.
   * @param id 
   */
  constructor (id?: string) {
    this.id = id || v4()
    this.version = 0
  }
  static async findOne<BaseEventType extends Event, AggregateImplementation extends Aggregate<BaseEventType>> (id: string, type: { new(id?: string): AggregateImplementation }): Promise<ResourceNotFound | Resource> {
    let aggregate: AggregateImplementation = new type(id)
    await aggregate.hydrate()
    return (aggregate.version === 0) ? new ResourceNotFound(id) : aggregate
  }
  static async findAll<BaseEventType extends Event, AggregateImplementation extends Aggregate<BaseEventType>> (type: { new(id?: string): AggregateImplementation }): Promise<Resource[]> {
    let records = await dynamo.scan({
      TableName: table
    }).promise()
    let resourcesAndEvents: { [key: string]: BaseEventType[] } = {}
    if (!records.Items) throw new NoDynamoData()
    for (let record of records.Items) {
      if (!resourcesAndEvents[record.id]) resourcesAndEvents[record.id] = []
      resourcesAndEvents[record.id].push(record as BaseEventType)
    }
    let aggregates: Aggregate<BaseEventType>[] = []
    for (let id of Object.keys(resourcesAndEvents)) {
      let aggregate: AggregateImplementation = new type(id)
      await aggregate.hydrate(resourcesAndEvents[id])
      aggregates.push(aggregate)
    }
    return aggregates as Resource[]
  }
  async events (): Promise<BaseEventType[]> {
    return (await dynamo.query({
      TableName: table,
      KeyConditionExpression: 'id = :id',
      ScanIndexForward: true,
      ExpressionAttributeValues: {
        ':id': this.id
      }
    }).promise()).Items as BaseEventType[]
  }
  async hydrate (hydrateFromEvents?: BaseEventType[]): Promise<void> {
    let events = (hydrateFromEvents) ? hydrateFromEvents : await this.events()
    this.apply(await events.filter(event => event.number > this.version))
  }
  // TODO compile time errors vs run time
  apply (events: Array<BaseEventType>): void {
    let methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
    for (var event of events) {
      let methodIndex = methods.indexOf('on' + event.type)
      if (methodIndex > -1) {
        (<any>this)[methods[methodIndex]](event)
        this.version++
        console.log(`Event number ${event.number} applied with ${methods[methodIndex]}.`)
      } else throw new Error(`Unsupported event detected for event type ${event.type}. Please implement on${event.type}(event: ${event.type}Event).`)
    }
  }
  async commit (event: Event): Promise<void> { 
    xray('resource', this.id, true)
    xray('event', event.type, true)
    xray('commit', JSON.stringify({ resource: this, event: event }), false)
    await this.hydrate()
    await this.apply([ event as BaseEventType ])
    if (this.version === 1 && event.number === 1) {
      /**
       * Create a new resource with an event.
       * 
       * The resource is created in a clash-safe way by ensuring that 
       *   the table doesn't already contain the generated id or event 
       *   number.
       */
      await dynamo.put({
        TableName: table,
        ConditionExpression: 'attribute_not_exists(id)',
        Item: {
          id: this.id,
          ...event
        }
      }).promise()
      return
    }
    if (this.version === event.number) {
      /**
       * Add a new event to an existing resource.
       */
      await dynamo.put({
        TableName: table,
        ConditionExpression: 'attribute_not_exists(#eventNumber)',
        ExpressionAttributeNames: {
          '#eventNumber': 'number'
        },
        Item: {
          id: this.id,
          ...event
        }
      }).promise()
      return
    }
    throw new IllegalEventNumberArgument()
  }
}

class BaseError extends Error {
  // We have to do complicated things to set the error prototype to be able to use instanceof on the error
  // This is an issue with Typescript and es5, maybe fixable when using webpack w/ es6?
  __proto__: Error
  constructor (message: string) {
    const trueProto = new.target.prototype
    super(message)
    this.__proto__ = trueProto
  }
}

class NoDynamoData extends BaseError {
  constructor () {
    super ('No data was returned from AWS DynamoDB.')
  }
}

class ResourceNotFound extends BaseError {
  constructor (id: string) {
    super (`The resource with id ${id} does not exist.`)
  }
}

class IllegalEventNumberArgument extends BaseError {
  constructor () {
    super ('The event is not being applied to a resource with an appropriate version.')
  }
}
