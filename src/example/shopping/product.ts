import { Resource, Event, Aggregate, AggregateOptions, environment } from '../../'

import express from 'express'
import asyncHandler from 'express-async-handler'

interface ProductResource extends Resource {
  readonly status?: 'available' | 'sold-out'
  readonly quantity?: number
}

interface ProductEvent extends Event {
  readonly type: 'ProductReserved' | 'ProductRestocked'
}

export interface ProductReservedEvent extends ProductEvent {
  readonly type: 'ProductReserved'
}

export interface ProductRestockedEvent extends ProductEvent {
  readonly type: 'ProductRestocked'
  readonly amount: number
}

export class Product extends Aggregate<ProductEvent> implements ProductResource {
  status?: 'available' | 'sold-out'
  quantity?: number
  constructor (options: AggregateOptions) {
    super (options)
  }
  onProductReserved (event: ProductReservedEvent): void {
    if (!this.quantity || this.status === 'sold-out') throw new Error('Failed to apply the event.')
    this.quantity -= 1
    this.status = (this.quantity > 0) ? 'available' : 'sold-out'
  }
  onProductRestocked (event: ProductRestockedEvent): void {
    if (event.amount === 0) throw new Error('Failed to apply the event.')
    if (!this.quantity) this.quantity = 0
    this.quantity += event.amount
    this.status = 'available'
  }
}

export const app = express()

app.post('/products/:id/buy', asyncHandler(async (req, res, next) => {
  // Create a new aggregate instance with the product id
  const product = new Product({ id: req.params.id })
  // Hydrate the aggregate (get the latest events and state)
  await product.hydrate()
  // Create the new event
  const event: ProductReservedEvent = {
    number: product.version + 1,
    type: 'ProductReserved'
  }
  // Commit the event to the Product aggregate
  await product.commit(event)
  // Send back a success status to the API client with the updated aggregate
  res.status(200).json(product)
}))

export const handler = (event: any, context: any, callback: any) => {
  return environment.router(event, context, callback, {
    api: {
      express: app
    }
  })
}
