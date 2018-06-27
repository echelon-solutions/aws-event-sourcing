# aws-event-sourcing

A straightforward way to build event based applications with AWS Lambda.

## Goals

- Events should be processed in order
- Events should be immutable
- Event history should be persisted
- Events and errors should be logged and traceable
- Resources should be uniquely identifiable
- Resource state should not be persisted, but instead derived from event history
- The system should be reactive
- The system should be easy to understand
- The system should be easily applicable to various business domains
- The system should scale easily
- The system should be fault-tolerant

## Stack

- Language [ Node, Typescript ]
- Framework [ Serverless ]
- Cloud (AWS) [ API Gateway, Lambda, DynamoDB ]

## Concepts

This design makes an assumption that everything in a system can be classified as either a `Resource` or an `Event`.

### Resource

A resource definition extends the `Resource` interface.

A resource is uniquely identifiable by UUID.

```typescript
export interface Resource {
  id: string
}
```

### Event

An event definition extends the `Event` interface.

An event has an event number, a type, and a creation date.

```typescript
export interface Event {
  number: number
  type: string
  created: string
}
```

### Aggregate

Learning from DDD (domain driven design) and ES (event sourcing), we  group a resource and its events into a domain `Aggregate`.

The `Aggregate` is responsible for reading and applying the events for a resource. This is called "hydrating" the resource, and is how we calculate the current state.

```typescript
export class Aggregate<BaseEventType extends Event> implements Resource {
  ...
}
```

The aggregate exposes the following methods.

- `findOne` | retrieve a resource by resource id with up-to-date state
- `findAll` | retrieve all resources with up-to-date state
- `events` | retrieve up-to-date event history
- `hydrate` | retrieve up-to-date event history and apply the events to the resource
- `apply` | call the appropriate handler to handle the event type and apply state changes to the resource
- `commit` | retrieve up-to-date event history, attempt to apply an event, then publish the new event

## Implementation

To implement the pattern above, we begin by defining the resource, the events that manipulate it, and the aggregate that is responsible for applying events and calculating state.

Let's look at this in the context of the online shopping business domain.

### Shopping Example

In most online ordering systems, there is a concept of a shopping cart. We want our site to be highly available, but we don't want to allow purchases of a product if we don't have any more of it left in our warehouse.

In this domain, our resource is the "Product", so let's define it along with its attributes.

```typescript
interface ProductResource extends Resource {
  status?: 'available' | 'sold-out'
  quantity?: number
}
```

Here we've defined a uniquely identifiable `ProductResource` that has 
a specific quantity, which lets us know how much of that product we have left in our warehouse.

There are several things that can happen during the shopping experience, both online and in our business. Let's define a base event type that shows us what events are possible.

```typescript
interface ProductEvent extends Event {
  type: 'ProductReserved' | 'ProductRestocked'
}
```

Before the customer checks out, we reserve the product for his/her purchase with a `ProductReservedEvent`. This should decrement the quantity available of the `Product` by 1.

```typescript
interface ProductReservedEvent extends ProductEvent {
  type: 'ProductReserved'
}
```

Also, at any time we may restock that specific product in our warehouse with a `ProductRestockedEvent`. This should increment the quantity available of the `Product`.

```typescript
interface ProductRestockedEvent extends ProductEvent {
  type: 'ProductRestocked'
  amount: number
}
```

We are almost done. All that is left is to implement our state changing business domain logic inside of the `Product` aggregate.

```typescript
export class Product extends Aggregate<ProductEvent> implements ProductResource {
  status?: 'available' | 'sold-out'
  quantity?: number
  constructor (id?: string) {
    super (id)
  }
  onProductReserved (event: ProductReservedEvent) {
    if (!this.quantity || this.status === 'sold-out') throw new Error('Failed to apply the event.')
    this.quantity -= 1
    this.status = (this.quantity > 0) ? 'available' : 'sold-out'
  }
  onProductRestocked (event: ProductRestockedEvent) {
    if (event.amount === 0) throw new Error('Failed to apply the event.')
    if (!this.quantity) this.quantity = 0
    this.quantity += event.amount
    this.status = 'available'
  }
}
```

And... we're done. we can now interface with the `Product` domain aggregate through its various methods. Let's expose an API that receives commands, loads the aggregate, and tries to apply new events.

```typescript
...
app.post('/products/{id}/buy', async (req, res, next) => 
  // Create a new aggregate instance with the product id
  let product = new Product(req.params.id)
  // Hydrate the aggregate (get the latest events and state)
  await product.hydrate()
  // Create the new event
  let event: ProductReservedEvent = {
    number: product.version + 1,
    type: 'ProductReserved',
    created: new Date().toISOString()
  }
  // Commit the event to the Product aggregate
  await product.commit(event)
  // Send back a success status to the API client
  res.status(200).send()
})
...
```

For a fully working and deployable project that demonstrates the shopping example above, browse to `./examples/shopping/` in this repository.


