import { xray } from './aws'

import express from 'express'
import * as AWSXRay from 'aws-xray-sdk'

/**
 * Create a new express app with defaults
 */
export function defaultApp () {
  let app = express()
  app.use(AWSXRay.express.openSegment('defaultName'))
  app.disable('x-powered-by')
  app.use(express.json())
  return app
}

/**
 * For the following middlewares to work properly, they must be the last middlewares injected by app.use()
 */
export const defaultMiddlewares = [
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    xray('error', 'CLIENT | 404 Not Found', true)
    res.status(404).send()
  },
  (error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error.message === 'Invalid request') {
      xray('error', `CLIENT | ${error.message}`, true)
      res.status(400).json({
        message: error.message
      })
    } else {
      console.error(error)
      xray('error', `SERVER | ${error.message}`, true)
      res.status(500).json({
        message: 'Internal server error'
      })
    }
  },
  AWSXRay.express.closeSegment()
]
