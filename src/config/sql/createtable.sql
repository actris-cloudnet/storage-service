CREATE TABLE IF NOT EXISTS "cloudnet-img" ( key VARCHAR(256) PRIMARY KEY, bucket_id SMALLINT);
CREATE TABLE IF NOT EXISTS "cloudnet-product" ( key VARCHAR(256) PRIMARY KEY, bucket_id SMALLINT);
CREATE TABLE IF NOT EXISTS "cloudnet-product-volatile" ( key VARCHAR(256) PRIMARY KEY, bucket_id SMALLINT);
CREATE TABLE IF NOT EXISTS "cloudnet-upload" ( key VARCHAR(256) PRIMARY KEY, bucket_id SMALLINT);
