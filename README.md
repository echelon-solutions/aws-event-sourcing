# aws-event-sourcing

A straightforward way to build event based applications with AWS Lambda.

![build](https://github.com/echelon-solutions/aws-event-sourcing/workflows/build/badge.svg) [![npm (scoped)](https://img.shields.io/npm/v/@echelon-solutions/aws-event-sourcing.svg)](https://www.npmjs.com/package/@echelon-solutions/aws-event-sourcing) ![GitHub last commit](https://img.shields.io/github/last-commit/echelon-solutions/aws-event-sourcing.svg?style=flat-square) ![GitHub](https://img.shields.io/github/license/echelon-solutions/aws-event-sourcing.svg?style=flat-square)

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

## Quickstart

```
npm install
npm run serverless:deploy
```

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

An event has an event number and a type.

```typescript
export interface Event {
  number: number
  type: string
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

> The `findAll` operation performs a scan on the DynamoDB table. This may become a performance issue
> as the table grows in size. Fortunately, only a single scan is needed to hydrate all resources and
> their events.

> Even though we are doing event sourcing, APIs have the ability to respond immediately,
> while async handlers are able to consume an ordered list of events. This is an extremely
> simple, powerful, and scalable serverless function and storage pattern.

## Implementation

To implement the pattern above, we begin by defining the resource, the events that manipulate it, and the aggregate that is responsible for applying events and calculating state.

Let's look at this in the context of the online shopping business domain.

### Shopping Example

In most online ordering systems, there is a concept of a shopping cart. We want our site to be highly available, but we don't want to allow purchases of a product if we don't have any more of it left in our warehouse.

First, let's import the eventing framework.

```typescript
import { Resource, Event, Aggregate, AggregateOptions } from '@echelon-solutions/aws-event-sourcing'
```

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
type ProductEvent = ProductReservedEvent | ProductRestockedEvent
```

Before the customer checks out, we reserve the product for his/her purchase with a `ProductReservedEvent`. This should decrement the quantity available of the `Product` by 1.

```typescript
interface ProductReservedEvent extends Event {
  type: 'ProductReserved'
}
```

Also, at any time we may restock that specific product in our warehouse with a `ProductRestockedEvent`. This should increment the quantity available of the `Product`.

```typescript
interface ProductRestockedEvent extends Event {
  type: 'ProductRestocked'
  amount: number
}
```

We are almost done. All that is left is to implement our state changing business domain logic inside of the `Product` aggregate.

```typescript
export class Product extends Aggregate<ProductEvent> implements ProductResource {
  status?: 'available' | 'sold-out'
  quantity?: number
  constructor (options: AggregateOptions) {
    super (options)
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
import express from 'express'
import asyncHandler from 'express-async-handler'

const app = express()

app.post('/products/:id/buy', asyncHandler(async (req, res, next) => {
  // Create a new aggregate instance with the product id
  let product = new Product({ id: req.params.id })
  // Hydrate the aggregate (get the latest events and state)
  await product.hydrate()
  // Create the new event
  let event: ProductReservedEvent = {
    number: product.version + 1,
    type: 'ProductReserved'
  }
  // Commit the event to the Product aggregate
  await product.commit(event)
  // Send back a success status to the API client with the updated aggregate
  res.status(200).json(product)
}))

app.listen(3000, () => console.log('listening'))
```

For a fully working and deployable project that demonstrates the shopping example above, browse to `./example/shopping/` in this repository.

## What? Why?

It doesn't look like we did much here. But actually, we achieved all of our goals with minimal code and complexity. Using other languages and frameworks, what we've built would have surmounted to hundreds of lines of code and infrastructure that is hard to understand and maintain.

Here are the goals again, with an explanation for how we accomplished each one.

> Events should be processed in order

Complete event history for a resource is loaded in memory every time we perform an operation on a resource. This guarantees that we are working with the most up to date data.

If two Lambdas happen to perform an update on the same version of a resource at the same time, DynamoDB conditional write logic prevents one event from succeeding.

Using AWS Lambda with DynamoDB Streams, we ensure that events are delivered in order both to the service and to subscribing services.

> Events should be immutable

We don't update or remove events, maintaining an accurate event history for every resource.

> Event history should be persisted

Every event record is a new insert into the DynamoDB table for that resource type.

> Events and errors should be logged and traceable

Events and errors are recorded as searchable elements into X-Ray, a traceability tool brought to you by the folks at AWS. This allows us to see failures not only for current code execution but also for downstream services that are called. Every request is assigned a unique trace id.

> Resources should be uniquely identifiable

Every new resource gets an autogenerated UUID V4 (random). This enables efficient sharding/partitioning on the DynamoDB table. A resource id does not need to be a globally unique identifier (GUID) -- it just needs to be unique as it pertains to the specific resource table in DynamoDB.

> Resource state should not be persisted, but instead derived from event history

We never save the current state of a resource. Every time a domain aggregate is loaded, it retrieves all events for the resource and applies them in order to build up the current resource state.

> The system should be reactive

All events are subscribable and services react with minimal latency by using AWS Lambda triggers on DynamoDB table streams.

> The system should be easy to understand

There are only two concepts in our system design: resources and events. It is easy to explain what is going on whether you are looking at code, the database, or logs since they are all based on these two concepts.

> The system should be easily applicable to various business domains

Since we generally describe everything as either a resource or an event, we can model virtually any business domain.

> The system should scale easily

We take advantage of serverless principles and AWS Lambda infrastructure to scale out our services on-demand, as-needed, and pay-as-you-go.

> The system should be fault-tolerant

Failed logic execution is retried for 24 hours, giving teams an adequate window to fix logic failures, after which failed events are reapplied automatically.
