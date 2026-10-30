-- Staging only: this is not the application schema and grants no browser access.
create schema if not exists migration_private;
revoke all on schema migration_private from public, anon, authenticated;
create table if not exists migration_private.sheet_rows (
  sheet text not null,
  source_row integer not null,
  data jsonb not null,
  primary key (sheet, source_row)
);
revoke all on table migration_private.sheet_rows from public, anon, authenticated;
alter table migration_private.sheet_rows enable row level security;
