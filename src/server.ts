import * as express from "express";
import config from "./config";
import { Routes } from "./routes";
import { ErrorRequestHandler } from "express";
import { Middleware } from "./middleware";
import { S3 } from "aws-sdk";
import * as crypto from "crypto";
import { DB } from "./db";
import pinoHttp from "pino-http";
import * as http from "node:http";
import * as basicAuth from "basic-auth";

async function createServer(): Promise<void> {
  const port = config.port;
  const app = express();

  const httpLogger = pinoHttp({
    redact: ["req.headers.authorization"],
  });
  app.use(httpLogger);

  const db = new DB();
  await db.init();

  app.use((req, res, next) => {
    const credentials = basicAuth(req);
    if (!credentials) {
      return next({ status: 401, msg: "Unauthorized" });
    }
    const pwHash = crypto
      .createHash("sha256")
      .update(credentials.pass)
      .digest("hex");
    const validCredentials = config.credentials.find(
      (cred) => cred.user === credentials.name
    );
    if (!validCredentials || pwHash != validCredentials.pwHash) {
      return next({ status: 401, msg: "Unauthorized" });
    }
    next();
  });

  const s3 = new S3(config.connection);

  const routes = new Routes(s3, db);
  const middleware = new Middleware(db);

  app.put("/:bucket/*key", middleware.validateParams, routes.putFile);
  app.get("/:bucket/*key", middleware.validateParams, routes.getFile);
  app.delete(
    "/:bucket/*key",
    middleware.validateDeleteBucket,
    middleware.validateParams,
    routes.deleteVolatileFile
  );

  const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    res.err = err;
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(err.status || 500);
    if (err.msg && err.msg.code) {
      // S3 error
      res.send(`Upstream error: ${err.msg.code}`);
    } else {
      res.send(err.msg);
    }
  };
  app.use(errorHandler);

  const server = http.createServer({ requestTimeout: 60 * 60 * 1000 }, app);
  server.listen(port, () =>
    console.log(
      `App listening on port ${port}, NODE_ENV=${process.env.NODE_ENV}, SS_MODE=${process.env.SS_MODE}`
    )
  );

  return new Promise((resolve, reject) => {
    process.on("SIGTERM", () => {
      console.log("SIGTERM signal received: closing HTTP server...");
      server.close(() => {
        console.log("HTTP server closed. Now closing database connection...");
        db.close()
          .then(() => {
            console.log("Database connection closed.");
            resolve();
          })
          .catch((err) => {
            console.error("Failed to close database connection:", err);
            reject(err);
          });
      });
    });
  });
}

createServer()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(`Fatal error: ${err}`);
    process.exit(1);
  });
