import os
import asyncpg
from typing import AsyncGenerator, Optional
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', 'postgres')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'course_compass')}"
)

_pool: Optional[asyncpg.Pool] = None


async def init_db_pool(
    min_size: int = 5,
    max_size: int = 20,
    command_timeout: float = 60.0
) -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=DATABASE_URL,
            min_size=min_size,
            max_size=max_size,
            command_timeout=command_timeout,
        )
    return _pool


async def close_db_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_db_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        return await init_db_pool()
    return _pool


async def get_db_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    pool = await get_db_pool()
    async with pool.acquire() as connection:
        yield connection
