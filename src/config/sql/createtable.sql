CREATE TABLE IF NOT EXISTS "cloudnet-img" ( key VARCHAR(256) PRIMARY KEY, bucket_id SMALLINT);
CREATE TABLE IF NOT EXISTS "cloudnet-product" ( key VARCHAR(256) PRIMARY KEY, bucket_id SMALLINT);
CREATE TABLE IF NOT EXISTS "cloudnet-product-volatile" ( key VARCHAR(256) PRIMARY KEY, bucket_id SMALLINT);
CREATE TABLE IF NOT EXISTS "cloudnet-upload" ( key VARCHAR(256) PRIMARY KEY, bucket_id SMALLINT);
CREATE TABLE IF NOT EXISTS bucketstats ( bucket VARCHAR(256) PRIMARY KEY, bucket_id SMALLINT, n_objects INT);
TRUNCATE TABLE bucketstats;
INSERT INTO bucketstats VALUES
    ('cloudnet-img', 0, 0),
    ('cloudnet-product', 0, 0),
    ('cloudnet-product-volatile', 0, 0),
    ('cloudnet-upload', 0, 0);
