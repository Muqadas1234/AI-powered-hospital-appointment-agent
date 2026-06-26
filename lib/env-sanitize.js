if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://");
}
