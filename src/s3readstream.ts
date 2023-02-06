// Based on https://github.com/tilfin/s3-block-read-stream
//
// MIT License
//
// Copyright (c) 2016 Toshimitsu Takahashi
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { Readable } from "node:stream";
import { S3 } from "aws-sdk";
import { GetObjectRequest } from "aws-sdk/clients/s3";

export class S3ReadStream extends Readable {
  private _readSize: number;
  private _fileSize: number;
  private _blockSize: number;
  private _s3: S3;
  private _params: GetObjectRequest;
  private _eTag: string | undefined;

  constructor(s3: S3, params: GetObjectRequest) {
    super();
    this._readSize = 0;
    this._fileSize = -1;
    this._blockSize = 64 * 1024 * 1024;
    this._s3 = s3;
    this._params = params;
  }

  _read() {
    if (this._readSize === this._fileSize) {
      this._done();
    } else if (this._readSize) {
      this._nextDownload();
    } else {
      this._fetchMetadata();
    }
  }

  _fetchMetadata() {
    this._s3.headObject(this._params, (err, data) => {
      if (err) {
        process.nextTick(() => this.emit("error", err));
        return;
      }
      if (data.ContentLength === undefined) {
        process.nextTick(() => this.emit("error", "Invalid content length"));
        return;
      }
      if (data.ContentLength > 0) {
        this._fileSize = data.ContentLength;
        this._eTag = data.ETag;
        this._nextDownload();
      } else {
        this._done();
      }
    });
  }

  _downloadRange(offset: number, length: number) {
    const lastPos = offset + length - 1;
    const range = "bytes=" + offset + "-" + lastPos;
    this._s3.getObject(
      {
        ...this._params,
        Range: range,
        IfMatch: this._eTag,
      },
      (err, data) => {
        if (err) {
          process.nextTick(() => this.emit("error", err));
          return;
        }
        if (data.ContentLength === undefined || data.Body === undefined) {
          process.nextTick(() => this.emit("error", "Invalid chunk"));
          return;
        }
        if (data.ContentLength > 0) {
          this._readSize += data.ContentLength;
          this.push(data.Body);
        } else {
          this._done();
        }
      }
    );
  }

  _nextDownload() {
    let len = 0;
    if (this._readSize + this._blockSize < this._fileSize) {
      len = this._blockSize;
    } else {
      len = this._fileSize - this._readSize;
    }
    this._downloadRange(this._readSize, len);
  }

  _done() {
    this._readSize = 0;
    this.push(null);
  }
}
