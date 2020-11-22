import { dynamo, xray, loadProperty, BaseError } from './environment'
import { v4 } from 'uuid'

/**
 * A resource is uniquely identifiable. 
 */
export interface Resource {
  readonly id: string
}

/**
 * An event has a number and a type.
 */
export interface Event {
  readonly number: number
  readonly type: string
}

export interface AggregateOptions {
  readonly id?: string
  readonly table?: string
}

export class Aggregate<BaseEventType extends Event> implements Resource {
  public static async findOne<BaseEventType extends Event, AggregateImplementation extends Aggregate<BaseEventType>> (type: new(options?: AggregateOptions) => AggregateImplementation, id: string, table?: string): Promise<AggregateImplementation | ResourceNotFound> {
    const aggregate: AggregateImplementation = new type({ id, table })
    await aggregate.hydrate()
    return (aggregate.version === 0) ? new ResourceNotFound(id) : aggregate
  }
  public static async findAll<BaseEventType extends Event, AggregateImplementation extends Aggregate<BaseEventType>> (type: new(options?: AggregateOptions) => AggregateImplementation, table?: string): Promise<AggregateImplementation[]> {
    const records = await dynamo.scan({
      TableName: table || loadProperty('DYNAMODB_TABLE')
    }).promise()
    const resourcesAndEvents: { [key: string]: BaseEventType[] } = {}
    if (!records.Items) return []
    for (const record of records.Items) {
      /* tslint:disable:no-object-mutation */
      if (!resourcesAndEvents[record.id]) resourcesAndEvents[record.id] = []
      resourcesAndEvents[record.id].push(record as BaseEventType)
    }
    const aggregates: AggregateImplementation[] = []
    for (const id of Object.keys(resourcesAndEvents)) {
      const aggregate: AggregateImplementation = new type({ id })
      await aggregate.hydrate(resourcesAndEvents[id])
      aggregates.push(aggregate)
    }
    return aggregates
  }
  public static json<BaseEventType extends Event, AggregateImplementation extends Aggregate<BaseEventType>> (aggregate: AggregateImplementation): Omit<AggregateImplementation, 'table'> {
    const { table, ...properties } = aggregate
    return properties
  }
  public readonly id: string
  public version: number
  public readonly table: string
  /**
   * Instantiate an aggregate instance, optionally passing in a resource id 
   *   to reference an existing resource.
   * @param id 
   */
  constructor (options?: AggregateOptions) {
    this.id = (options && options.id) ? options.id : v4()
    this.version = 0
    this.table = (options && options.table) ? options.table : loadProperty('DYNAMODB_TABLE')
  }
  public async events (): Promise<BaseEventType[]> {
    return (await dynamo.query({
      TableName: this.table,
      KeyConditionExpression: 'id = :id',
      ScanIndexForward: true,
      ExpressionAttributeValues: {
        ':id': this.id
      }
    }).promise()).Items as BaseEventType[]
  }
  public async hydrate (hydrateFromEvents?: BaseEventType[]): Promise<void> {
    const events = (hydrateFromEvents) ? hydrateFromEvents : await this.events()
    this.apply(events.filter(event => event.number > this.version))
  }
  public async commit (event: BaseEventType): Promise<void> { 
    xray('resource', this.id, true)
    xray('event', event.type, true)
    /* tslint:disable:object-literal-shorthand */
    xray('commit', JSON.stringify({ resource: this, event: event }), false)
    await this.hydrate()
    await this.apply([ event ])
    if (this.version === 1 && event.number === 1) {
      /**
       * Create a new resource with an event.
       * 
       * The resource is created in a clash-safe way by ensuring that 
       *   the table doesn't already contain the generated id or event 
       *   number.
       */
      await dynamo.put({
        TableName: this.table,
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
        TableName: this.table,
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
  protected onEvent (event: Event): void {
    console.warn('Generic event handler. You will only get this warning if you failed to implement the aggregate.')
  }
  // TODO compile time errors vs run time
  private apply (events: BaseEventType[]): void {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
    for (const event of events) {
      const methodIndex = methods.indexOf('on' + event.type)
      if (methodIndex > -1) {
        (this as any)[methods[methodIndex]](event)
        this.version++
        console.log(`Event number ${event.number} applied with ${methods[methodIndex]}.`)
      } else throw new IllegalEventArgument(event)
    }
  }
}

export class IllegalEventNumberArgument extends BaseError {
  constructor () {
    super ('The event is not being applied to a resource with an appropriate version.')
  }
}

export class IllegalEventArgument extends BaseError {
  constructor (event: Event) {
    super (`Unsupported event detected for event type ${event.type}. Please implement on${event.type}(event: ${event.type.endsWith('Event') ? event.type : event.type + 'Event'}).`)
  }
}

export class ResourceNotFound extends BaseError {
  constructor (id: string) {
    super (`The resource with id ${id} does not exist.`)
  }
}
