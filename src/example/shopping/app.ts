import { Product, ProductReservedEvent } from './product'

import express from 'express'
import asyncHandler from 'express-async-handler'

const app = express()

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

export default app
