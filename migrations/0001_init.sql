-- Add migration script here
CREATE TABLE things (
    id SERIAL PRIMARY KEY,
    aaa BYTEA NOT NULL,
    bbb BYTEA NOT NULL,
    ccc BYTEA NOT NULL
);
