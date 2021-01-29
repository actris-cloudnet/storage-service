# storage-service

## Commands

- `./control dev-start remote` to use the S3 `remote-ro` mode.
- `./control dev-start local` to use the S3 mock (e.g. previous `./control dev-start` functionality)
- `./control fetch-remote-db` fetches remote db.
- `./control dev-fetch-and-start` fetches remote db and starts SS in `remote-ro` mode.
- `./control reset-db` resets the database (i.e. removes everything).

Additionally,

    ./control dev-install
    ./control dev-stop
    ./control dev-restart

