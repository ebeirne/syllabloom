from __future__ import annotations

import hashlib
from datetime import datetime, timezone

import psycopg

from api.ai_card_generation import AIMonthlyBudgetLimitError, AIUsageLimitError, AIUsageUnavailable
from api.user_data import _database_url


# These conservative beta ceilings cap provider usage even if a key is misused.
PER_USER_DAILY_SOURCE_CHARS = 192_000
GLOBAL_DAILY_SOURCE_CHARS = 1_000_000
# Keep a $2 buffer below the user's $20 provider balance for billing variance.
GLOBAL_MONTHLY_BUDGET_MICRODOLLARS = 18_000_000


def reserve_ai_usage(user_id: str, source_chars: int, max_cost_microdollars: int) -> None:
    if (
        not isinstance(user_id, str)
        or not user_id
        or not 0 <= source_chars <= 48_000
        or not isinstance(max_cost_microdollars, int)
        or max_cost_microdollars < 0
    ):
        raise AIUsageUnavailable()
    if max_cost_microdollars > GLOBAL_MONTHLY_BUDGET_MICRODOLLARS:
        raise AIMonthlyBudgetLimitError()
    database_url = _database_url()
    if not database_url:
        raise AIUsageUnavailable()

    user_scope = "user:" + hashlib.sha256(user_id.encode("utf-8")).hexdigest()
    scopes = (
        ("global", GLOBAL_DAILY_SOURCE_CHARS),
        (user_scope, PER_USER_DAILY_SOURCE_CHARS),
    )
    usage_date = datetime.now(timezone.utc).date()
    usage_month = usage_date.replace(day=1)
    try:
        # Always lock global first, then the user row, so concurrent reservations
        # are atomic and use one lock order.
        with psycopg.connect(database_url, connect_timeout=5) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS syllabloom_ai_usage_daily (
                    usage_date DATE NOT NULL,
                    scope_key TEXT NOT NULL,
                    source_chars BIGINT NOT NULL DEFAULT 0 CHECK (source_chars >= 0),
                    PRIMARY KEY (usage_date, scope_key)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS syllabloom_ai_usage_monthly (
                    usage_month DATE PRIMARY KEY,
                    reserved_microdollars BIGINT NOT NULL DEFAULT 0 CHECK (reserved_microdollars >= 0)
                )
                """
            )
            connection.execute(
                "DELETE FROM syllabloom_ai_usage_daily WHERE usage_date < %s - INTERVAL '90 days'",
                (usage_date,),
            )
            for scope_key, ceiling in scopes:
                row = connection.execute(
                    """
                    INSERT INTO syllabloom_ai_usage_daily (usage_date, scope_key, source_chars)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (usage_date, scope_key) DO UPDATE
                    SET source_chars = syllabloom_ai_usage_daily.source_chars + EXCLUDED.source_chars
                    WHERE syllabloom_ai_usage_daily.source_chars + EXCLUDED.source_chars <= %s
                    RETURNING source_chars
                    """,
                    (usage_date, scope_key, source_chars, ceiling),
                ).fetchone()
                if row is None:
                    raise AIUsageLimitError()
            row = connection.execute(
                """
                INSERT INTO syllabloom_ai_usage_monthly (usage_month, reserved_microdollars)
                VALUES (%s, %s)
                ON CONFLICT (usage_month) DO UPDATE
                SET reserved_microdollars = syllabloom_ai_usage_monthly.reserved_microdollars + EXCLUDED.reserved_microdollars
                WHERE syllabloom_ai_usage_monthly.reserved_microdollars + EXCLUDED.reserved_microdollars <= %s
                RETURNING reserved_microdollars
                """,
                (usage_month, max_cost_microdollars, GLOBAL_MONTHLY_BUDGET_MICRODOLLARS),
            ).fetchone()
            if row is None:
                raise AIMonthlyBudgetLimitError()
    except AIUsageLimitError:
        raise
    except AIMonthlyBudgetLimitError:
        raise
    except Exception as exc:
        # Fail closed: never call the paid provider without a working usage cap.
        raise AIUsageUnavailable() from exc
