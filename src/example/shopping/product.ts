import { Resource, Event, Aggregate, AggregateOptions } from '../../'

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
