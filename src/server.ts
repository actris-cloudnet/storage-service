import * as express from 'express'
import config from './config'
import {Routes} from './routes'
import {ErrorRequestHandler} from 'express'
import {Middleware} from './middleware'
import {S3} from 'aws-sdk'
import * as passport from 'passport'
import {BasicStrategy} from 'passport-http'
import * as crypto from 'crypto'

(async function() {
  const port = config.port
  const app = express()

  passport.use(new BasicStrategy((user: string, pw: string, done: Function) => {
    const pwHash = crypto.createHash('sha256').update(pw).digest('hex')
    const validCredentials = config.credentials.filter(cred => cred.user == user)[0]
    if (!validCredentials || pwHash != validCredentials.pwHash) return done(null, false)
    return done(null, user)
  }))

  const s3 = new S3(config.connection)
  // Create buckets if they don't exist
  if (process.env.NODE_ENV != 'production') {
    await Promise.all(config.buckets.map(bucket => {
      s3.createBucket({Bucket: bucket}, e => e)
    }
    ))
  }

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

  const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    res.status(err.status || 500)
    res.send(err.msg || err)
    next()
  }
  app.use(errorHandler)

  app.listen(port, () => console.log(`App listening on port ${port}!`))

})()
