# Storage service

This service provides a gateway to S3 for the Cloudnet projects.

## Installing and running

The storage service is distributed as a docker container as a part of the Cloudnet development toolkit.
See the [README of the dev-toolkit repository](https://github.com/actris-cloudnet/dev-toolkit/) on how to set up the CLU development environment.

When you have the environment running, you can run commands inside the container with `./run`.
For instance, to run tests you can issue:

```shell
./run npm test
```

## License

MIT
