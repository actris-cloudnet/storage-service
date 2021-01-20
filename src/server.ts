import * as express from 'express'
import config from './config'
import {Routes} from './routes'
import {ErrorRequestHandler} from 'express'
import {Middleware} from './middleware'
import {S3} from 'aws-sdk'
import * as passport from 'passport'
import {BasicStrategy} from 'passport-http'
import * as crypto from 'crypto'
import { Client } from 'pg'

(async function() {
  const port = config.port
  const app = express()

  const client = new Client()
  await client.connect()

  passport.use(new BasicStrategy((user: string, pw: string, done: Function) => {
    const pwHash = crypto.createHash('sha256').update(pw).digest('hex')
    const validCredentials = config.credentials.filter(cred => cred.user == user)[0]
    if (!validCredentials || pwHash != validCredentials.pwHash) return done(null, false)
    return done(null, user)
  }))

  const s3 = new S3(config.connection)

  const routes = new Routes(s3)
  const middleware = new Middleware()

  app.put('/:bucket/*',
    passport.authenticate('basic', {session: false}),
    middleware.validateParams,
    routes.putFile)
  app.get('/:bucket/*',
    passport.authenticate('basic', {session: false}),
    middleware.validateParams,
    routes.getFile)
  app.delete('/:bucket/*',
    passport.authenticate('basic', {session: false}),
    middleware.validateParams,
    middleware.validateDeleteBucket,
    routes.deleteVolatileFile)

  const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    if (err.status)
      console.error(`Error ${err.status} in ${req.method} ${req.path}:`, JSON.stringify(err, null, 2))
    else
      console.error(`Error 500 in ${req.method} ${req.path}:`, err)
    res.status(err.status || 500)
    if (err.msg.code) // S3 error
      res.send(`Upstream error: ${err.msg.code}`)
    else res.send(err.msg)
    next()
  }
  app.use(errorHandler)

  app.listen(port, () => console.log(`App listening on port ${port}, NODE_ENV=${process.env.NODE_ENV}`))

})()
