import os
import urllib.parse

import psycopg
from psycopg import sql
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    parsed = urllib.parse.urlparse(DATABASE_URL)
    DB_HOST = parsed.hostname or "localhost"
    DB_PORT = parsed.port or 5432
    DB_USER = urllib.parse.unquote(parsed.username) if parsed.username else "postgres"
    DB_PASSWORD = urllib.parse.unquote(parsed.password) if parsed.password else "postgres"
    DB_NAME = urllib.parse.unquote(parsed.path.lstrip("/")) or "course_compass"
else:
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", "5432"))
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
    DB_NAME = os.getenv("DB_NAME", "course_compass")


def create_database_if_not_exists():
    try:
        with psycopg.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname="postgres",
            autocommit=True,  # CREATE DATABASE cannot run inside a transaction.
        ) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM pg_database WHERE datname = %s;", (DB_NAME,)
                )
                exists = cur.fetchone()
                if not exists:
                    cur.execute(
                        sql.SQL("CREATE DATABASE {}").format(sql.Identifier(DB_NAME))
                    )
                    print(f"Database '{DB_NAME}' created successfully.")
                else:
                    print(f"Database '{DB_NAME}' already exists.")
    except Exception as e:
        # Continue: the target database may exist even if this user cannot
        # connect to the maintenance database or create databases.
        print(f"Notice during database check/creation: {e}")

def initialize_schema():
    try:
        with psycopg.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=DB_NAME,
        ) as conn:
            with conn.cursor() as cur:
                schema_path = os.path.join(
                    os.path.dirname(__file__), "schema.sql"
                )
                with open(schema_path, "r", encoding="utf-8") as f:
                    schema_sql = f.read()
                cur.execute(schema_sql)
                conn.commit()
                print("Database schema and tables initialized successfully.")
    except Exception as e:
        print(f"Error applying database schema: {e}")
        raise

if __name__ == "__main__":
    print(f"Connecting to PostgreSQL at {DB_HOST}:{DB_PORT} as user '{DB_USER}'...")
    create_database_if_not_exists()
    initialize_schema()
    print("Setup completed with optimal table structures.")