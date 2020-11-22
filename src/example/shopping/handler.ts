import { router } from '../../'

import app from './app'

export const product = (event: any, context: any, callback: any) => {
  return router(event, context, callback, {
    api: {
      express: app
    }
  })
}
